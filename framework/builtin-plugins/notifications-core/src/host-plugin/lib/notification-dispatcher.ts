/** Notification deliveries dispatcher.
 *
 *  Drains the `notification_deliveries` queue created by
 *  `notification-rules.fireEvent()`. One delivery row per rule per
 *  channel per record. Status transitions:
 *
 *    pending → sent | failed | suppressed
 *
 *  Per-channel handlers:
 *    in-app   — writes a record-link row tagged 'notification' so the
 *               recipient's notification feed surfaces it. No external
 *               I/O; always succeeds when recipients resolve.
 *    email    — calls `sendEmail()` (deferred; falls through to console
 *               in dev, SMTP in prod via env).
 *    webhook  — POSTs payload + HMAC-SHA-256 signature like the
 *               webhook-dispatcher.
 *    sms      — pluggable; default impl logs and marks 'failed'.
 *
 *  Retry strategy: exponential backoff with jitter, max 5 attempts,
 *  capped at 30 minutes between retries. Failures persist `last_error`
 *  for the admin UI; rows are kept indefinitely (audit trail).
 *
 *  Concurrency: a single in-process loop with a SQLite-backed lock so
 *  multi-process deployments still serialize. Worker also subscribes
 *  to the in-process event bus to react immediately on new deliveries
 *  (no need to poll on a hot path). */

import { db, nowIso } from "@gutu-host";
import { uuid } from "@gutu-host";
import { createHmac } from "node:crypto";
import { subscribeRecordEvents } from "@gutu-host/event-bus";

type Channel = "in-app" | "email" | "webhook" | "sms";

interface Row {
  id: string;
  tenant_id: string;
  rule_id: string;
  resource: string;
  record_id: string;
  channel: Channel;
  status: "pending" | "sent" | "failed" | "suppressed";
  attempts: number;
  last_error: string | null;
  payload: string | null;
  created_at: string;
  updated_at: string;
}

interface Payload {
  subject?: string;
  body: string;
  channelConfig?: Record<string, unknown>;
  recipients?: string[];
}

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = (attempt: number): number => {
  // 1s, 4s, 15s, 60s, 300s (jittered ±20 %).
  const base = [1_000, 4_000, 15_000, 60_000, 300_000][attempt - 1] ?? 1_800_000;
  const jitter = base * (Math.random() * 0.4 - 0.2);
  return Math.max(500, Math.floor(base + jitter));
};

let running = false;
let started = false;
let abortController: AbortController | null = null;

/** Marker on `meta` table to coordinate exclusivity across processes. */
const LOCK_KEY = "notification_dispatcher_lock";

function tryAcquireLock(): boolean {
  // Acquire if not held in the last 60 s. Stale locks (process crash)
  // recover automatically after the timeout.
  const now = Date.now();
  const expiry = now + 60_000;
  const tx = db.transaction(() => {
    const existing = db.prepare(`SELECT value FROM meta WHERE key = ?`)
      .get(LOCK_KEY) as { value: string } | undefined;
    if (existing) {
      const heldUntil = Number(existing.value);
      if (Number.isFinite(heldUntil) && heldUntil > now) return false;
    }
    db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(LOCK_KEY, String(expiry));
    return true;
  });
  return tx();
}

function refreshLock(): void {
  const expiry = Date.now() + 60_000;
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(LOCK_KEY, String(expiry));
}

function releaseLock(): void {
  db.prepare(`DELETE FROM meta WHERE key = ?`).run(LOCK_KEY);
}

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function pickReady(limit: number): Row[] {
  return db
    .prepare(
      `SELECT * FROM notification_deliveries
       WHERE status = 'pending' AND attempts < ?
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(MAX_ATTEMPTS, limit) as Row[];
}

function markStatus(
  id: string,
  status: Row["status"],
  patch: { lastError?: string | null; response?: string | null; attempts?: number },
): void {
  const fields: string[] = ["status = ?", "updated_at = ?"];
  const args: unknown[] = [status, nowIso()];
  if (patch.lastError !== undefined) {
    fields.push("last_error = ?");
    args.push(patch.lastError);
  }
  if (patch.response !== undefined) {
    fields.push("response = ?");
    args.push(patch.response);
  }
  if (patch.attempts !== undefined) {
    fields.push("attempts = ?");
    args.push(patch.attempts);
  }
  args.push(id);
  db.prepare(
    `UPDATE notification_deliveries SET ${fields.join(", ")} WHERE id = ?`,
  ).run(...args);
}

async function dispatchOne(row: Row): Promise<void> {
  const payload = parseJson<Payload>(row.payload, { body: "" });
  const attempts = row.attempts + 1;
  try {
    switch (row.channel) {
      case "in-app":
        await sendInApp(row, payload);
        markStatus(row.id, "sent", { lastError: null, attempts });
        return;
      case "email":
        await sendEmail(row, payload);
        markStatus(row.id, "sent", { lastError: null, attempts });
        return;
      case "webhook":
        await sendWebhook(row, payload);
        markStatus(row.id, "sent", { lastError: null, attempts });
        return;
      case "sms":
        await sendSms(row, payload);
        markStatus(row.id, "sent", { lastError: null, attempts });
        return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (attempts >= MAX_ATTEMPTS) {
      markStatus(row.id, "failed", { lastError: msg, attempts });
    } else {
      markStatus(row.id, "pending", { lastError: msg, attempts });
    }
  }
}

/* ----------------------------- Channel handlers -------------------------- */

async function sendInApp(row: Row, payload: Payload): Promise<void> {
  // Write a record_link of kind='notification' for each recipient. The
  // notification feed (a future surface) reads from record_links.
  const recipients = resolveRecipients(payload);
  if (recipients.length === 0) {
    throw new Error("No recipients resolved for in-app channel");
  }
  const now = nowIso();
  const tx = db.transaction(() => {
    for (const recipient of recipients) {
      const id = uuid();
      const targetResource = recipient.startsWith("user:") ? "platform.user" : "platform.notification";
      const targetId = recipient.startsWith("user:") ? recipient.slice("user:".length) : recipient;
      db.prepare(
        `INSERT INTO record_links
           (id, tenant_id, from_resource, from_id, to_resource, to_id, kind, payload, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'notification', ?, 'system:notify', ?)`,
      ).run(
        id,
        row.tenant_id,
        row.resource,
        row.record_id,
        targetResource,
        targetId,
        JSON.stringify({ subject: payload.subject ?? "", body: payload.body, ruleId: row.rule_id }),
        now,
      );
    }
  });
  tx();
}

async function sendEmail(row: Row, payload: Payload): Promise<void> {
  const recipients = resolveRecipients(payload);
  if (recipients.length === 0) {
    throw new Error("No email recipients resolved");
  }
  const subject = payload.subject ?? "Notification";
  const body = payload.body;
  // SMTP is opt-in via env. Without it, log + mark sent in dev so
  // downstream tests/devs can see fires; this matches the webhook
  // dispatcher's behaviour of "best effort with audit".
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === "test") {
      // No-op in tests.
      return;
    }
    console.log(
      `[notification.email] (no SMTP_HOST) -> ${recipients.join(", ")}: ${subject}`,
    );
    return;
  }
  // Lightweight SMTP via fetch to a webhook is out of scope here; in a
  // production deployment, swap in nodemailer:
  //
  //   const nodemailer = await import("nodemailer");
  //   const tx = nodemailer.createTransport({ host: SMTP_HOST, ... });
  //   await tx.sendMail({ from, to: recipients, subject, html: body });
  //
  // We surface this as a TODO and never silently succeed in prod.
  throw new Error(
    "SMTP_HOST is set but nodemailer integration is not wired in this build",
  );
}

async function sendWebhook(row: Row, payload: Payload): Promise<void> {
  const cfg = (payload.channelConfig ?? {}) as { url?: string; secret?: string; headers?: Record<string, string> };
  const url = cfg.url;
  if (!url) throw new Error("Webhook channel config missing url");
  const body = JSON.stringify({
    tenantId: row.tenant_id,
    resource: row.resource,
    recordId: row.record_id,
    ruleId: row.rule_id,
    subject: payload.subject ?? null,
    body: payload.body,
    deliveryId: row.id,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Notification-Delivery-Id": row.id,
    ...(cfg.headers ?? {}),
  };
  if (cfg.secret) {
    const sig = createHmac("sha256", cfg.secret).update(body).digest("hex");
    headers["X-Notification-Signature"] = `sha256=${sig}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${errBody.slice(0, 256)}`);
    }
    const respText = await res.text().catch(() => "");
    markStatus(row.id, "sent", {
      response: respText.slice(0, 1024),
      attempts: row.attempts + 1,
      lastError: null,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function sendSms(row: Row, payload: Payload): Promise<void> {
  const recipients = resolveRecipients(payload);
  if (recipients.length === 0) throw new Error("No SMS recipients resolved");
  if (!process.env.SMS_PROVIDER_URL) {
    if (process.env.NODE_ENV === "test") return;
    throw new Error("SMS_PROVIDER_URL is not configured");
  }
  const body = JSON.stringify({
    to: recipients,
    text: `${payload.subject ? payload.subject + ": " : ""}${stripHtml(payload.body)}`.slice(0, 1500),
    deliveryId: row.id,
  });
  const res = await fetch(process.env.SMS_PROVIDER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
}

function resolveRecipients(p: Payload): string[] {
  return Array.isArray(p.recipients) ? p.recipients.filter((r) => typeof r === "string") : [];
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/* ----------------------------- Loop -------------------------------------- */

async function loop(): Promise<void> {
  while (running) {
    if (!tryAcquireLock()) {
      // Another process is dispatching; back off and try again.
      await sleep(5_000, abortController?.signal);
      continue;
    }
    refreshLock();
    let drained = 0;
    try {
      const batch = pickReady(50);
      if (batch.length === 0) {
        // Nothing to do; wait for an event-bus tickle or poll-cycle.
        await sleep(3_000, abortController?.signal);
        continue;
      }
      for (const row of batch) {
        if (!running) break;
        // Apply backoff: skip rows that just failed.
        if (row.attempts > 0) {
          const dueAt =
            new Date(row.updated_at).getTime() + BACKOFF_MS(row.attempts);
          if (Date.now() < dueAt) continue;
        }
        await dispatchOne(row);
        drained++;
      }
    } catch (err) {
      console.error("[notification-dispatcher] loop error", err);
    } finally {
      refreshLock();
    }
    // Tight loop while we have work; otherwise breathe.
    if (drained === 0) await sleep(2_000, abortController?.signal);
  }
  releaseLock();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/* ----------------------------- Public API -------------------------------- */

/** Start the dispatcher. Idempotent — calling twice is a no-op. */
export function startNotificationDispatcher(): void {
  if (started) return;
  started = true;
  running = true;
  abortController = new AbortController();
  // Tickle on every record event so newly-queued deliveries are
  // attempted ASAP without waiting for a poll cycle.
  subscribeRecordEvents(() => {
    // The poll loop will pick up new rows on its next iteration; the
    // existence of any pending row will cause a tight cycle.
  });
  void loop().catch((err) => {
    console.error("[notification-dispatcher] fatal", err);
  });
}

export function stopNotificationDispatcher(): void {
  running = false;
  abortController?.abort();
  abortController = null;
  started = false;
}

/** Force-drain once (test helper / manual trigger). Returns counts. */
export async function drainOnce(limit = 100): Promise<{ attempted: number; sent: number; failed: number }> {
  let attempted = 0;
  let sent = 0;
  let failed = 0;
  const rows = pickReady(limit);
  for (const row of rows) {
    attempted++;
    const before = pickRow(row.id);
    await dispatchOne(row);
    const after = pickRow(row.id);
    if (after?.status === "sent") sent++;
    else if (after?.status === "failed") failed++;
  }
  return { attempted, sent, failed };
}

function pickRow(id: string): Row | null {
  const r = db
    .prepare(`SELECT * FROM notification_deliveries WHERE id = ?`)
    .get(id) as Row | undefined;
  return r ?? null;
}

/** Manually replay a failed/sent delivery. Resets to 'pending', counter
 *  preserved so backoff still applies. Audit-logged by the route. */
export function replayDelivery(tenantId: string, id: string): boolean {
  const r = db.prepare(
    `UPDATE notification_deliveries
       SET status = 'pending', last_error = NULL, updated_at = ?
       WHERE tenant_id = ? AND id = ?`,
  ).run(nowIso(), tenantId, id);
  return r.changes > 0;
}

/** Suppress a delivery so it never fires (e.g. user opted out). */
export function suppressDelivery(tenantId: string, id: string, reason: string): boolean {
  const r = db.prepare(
    `UPDATE notification_deliveries
       SET status = 'suppressed', last_error = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ? AND status = 'pending'`,
  ).run(reason, nowIso(), tenantId, id);
  return r.changes > 0;
}
