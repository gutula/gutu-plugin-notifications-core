/** Time-based notification rule scheduler.
 *
 *  Handles three event kinds that aren't fired by record CRUD:
 *
 *    days-after / days-before     — fires once per (rule, record) when
 *                                    a record's `triggerField` (a date)
 *                                    is `offsetDays` ago/away from now.
 *                                    Tracked in `notification_schedule_runs`
 *                                    so we don't fire twice for the same
 *                                    (rule, record, scheduled_for) tuple.
 *
 *    cron                          — fires once per matching cron tick.
 *                                    Doesn't take a record; rules with
 *                                    cron event run for the *tenant*
 *                                    and bind a synthetic empty record
 *                                    (templates can still call APIs in
 *                                    follow-up actions if extended).
 *
 *  Scheduling cadence: the scheduler ticks every minute (cheap) and
 *  inspects every enabled time-based rule. Time-based rules are usually
 *  few and the queries are bounded, so we keep this straightforward
 *  rather than maintaining a separate priority queue.
 *
 *  Idempotency: each scheduled fire writes a row in
 *  `notification_schedule_runs (rule_id, record_id, scheduled_for)`
 *  with PRIMARY KEY on the tuple. INSERT … ON CONFLICT DO NOTHING is
 *  the locking primitive — only one process can claim a given fire.
 *
 *  Concurrency: an instance lock in `meta` (separate key from the
 *  dispatcher) coordinates so multiple processes don't double-tick.
 */

import { db, nowIso } from "@gutu-host";
import { fireEvent, type NotificationRule } from "@gutu-plugin/notifications-core";

const LOCK_KEY = "notification_scheduler_lock";
const TICK_MS = 60_000;

let started = false;
let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

function ensureRunsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_schedule_runs (
      rule_id        TEXT NOT NULL,
      record_id      TEXT NOT NULL,
      scheduled_for  TEXT NOT NULL,
      fired_at       TEXT NOT NULL,
      PRIMARY KEY (rule_id, record_id, scheduled_for)
    );
  `);
}

function tryAcquireLock(): boolean {
  const now = Date.now();
  const expiry = now + 90_000;
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

function releaseLock(): void {
  db.prepare(`DELETE FROM meta WHERE key = ?`).run(LOCK_KEY);
}

interface RuleRow {
  id: string;
  tenant_id: string;
  name: string;
  resource: string;
  event: string;
  condition: string | null;
  trigger_field: string | null;
  offset_days: number | null;
  cron_expr: string | null;
  channels: string;
  subject: string | null;
  body_template: string;
  enabled: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function listTimeBasedRules(): RuleRow[] {
  return db
    .prepare(
      `SELECT * FROM notification_rules
       WHERE enabled = 1 AND event IN ('days-after', 'days-before', 'cron')`,
    )
    .all() as RuleRow[];
}

interface RecordRow {
  id: string;
  resource: string;
  data: string;
}

function recordsWithDateField(
  resource: string,
  field: string,
  rangeStart: Date,
  rangeEnd: Date,
  tenantId: string,
): Array<{ id: string; record: Record<string, unknown> }> {
  // Records table is generic with JSON payload. We do a simple range
  // scan via json_extract — fine for typical volumes; revisit when
  // record counts climb (then promote a generated column + index).
  const rows = db
    .prepare(
      `SELECT id, resource, data FROM records
         WHERE resource = ?
           AND COALESCE(json_extract(data, '$.status'), 'active') != 'deleted'
           AND json_extract(data, '$.tenantId') = ?
           AND json_extract(data, '$.' || ?) >= ?
           AND json_extract(data, '$.' || ?) <= ?`,
    )
    .all(
      resource,
      tenantId,
      field,
      rangeStart.toISOString(),
      field,
      rangeEnd.toISOString(),
    ) as RecordRow[];
  const out: Array<{ id: string; record: Record<string, unknown> }> = [];
  for (const r of rows) {
    try {
      out.push({ id: r.id, record: JSON.parse(r.data) as Record<string, unknown> });
    } catch {
      /* tolerate malformed */
    }
  }
  return out;
}

/** Fire once if not already fired for (rule, record, scheduled_for). */
function fireOnce(
  rule: RuleRow,
  recordId: string,
  scheduledFor: Date,
  record: Record<string, unknown>,
): boolean {
  const inserted = db
    .prepare(
      `INSERT OR IGNORE INTO notification_schedule_runs
         (rule_id, record_id, scheduled_for, fired_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(rule.id, recordId, scheduledFor.toISOString(), nowIso());
  if (inserted.changes === 0) return false;
  fireEvent({
    tenantId: rule.tenant_id,
    resource: rule.resource,
    event: rule.event as never,
    recordId,
    record,
  });
  return true;
}

/** Days-after / days-before evaluation. Looks for records whose
 *  `triggerField` falls within [now − offsetDays, now − offsetDays + 1d]
 *  (for days-after) or [now + offsetDays, now + offsetDays + 1d] (for
 *  days-before). The 1-day window catches schedule misses without
 *  causing duplicates (the runs table dedupes on the day bucket). */
function tickRelative(rule: RuleRow): number {
  if (!rule.trigger_field || rule.offset_days == null) return 0;
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const target = new Date(
    rule.event === "days-after"
      ? now.getTime() - rule.offset_days * dayMs
      : now.getTime() + rule.offset_days * dayMs,
  );
  const dayStart = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + dayMs - 1);
  const candidates = recordsWithDateField(
    rule.resource,
    rule.trigger_field,
    dayStart,
    dayEnd,
    rule.tenant_id,
  );
  // scheduled_for is the day-bucket so re-tick during the day doesn't refire.
  const scheduledFor = dayStart;
  let fired = 0;
  for (const c of candidates) {
    if (fireOnce(rule, c.id, scheduledFor, c.record)) fired++;
  }
  return fired;
}

/** Cron evaluation — minimal 5-field cron parser:
 *  "<minute> <hour> <day-of-month> <month> <day-of-week>"
 *  Each field: '*' | a list of integers separated by ',' | a step like '/N'.
 *  No ranges (3-7) on purpose — keep the parser tight; users with
 *  range needs can express them as comma lists.
 *  Bucket: minute granularity → scheduled_for is "<YYYY-MM-DDTHH:MM:00Z>".
 */
function tickCron(rule: RuleRow): number {
  if (!rule.cron_expr) return 0;
  const now = new Date();
  if (!cronMatches(rule.cron_expr, now)) return 0;
  // For cron rules, there's no record id; we use 'cron' as a sentinel.
  const scheduledFor = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
    ),
  );
  return fireOnce(rule, "cron", scheduledFor, {}) ? 1 : 0;
}

function cronMatches(expr: string, when: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dom, month, dow] = parts;
  return (
    fieldMatches(minute!, when.getUTCMinutes(), 0, 59) &&
    fieldMatches(hour!, when.getUTCHours(), 0, 23) &&
    fieldMatches(dom!, when.getUTCDate(), 1, 31) &&
    fieldMatches(month!, when.getUTCMonth() + 1, 1, 12) &&
    fieldMatches(dow!, when.getUTCDay(), 0, 6)
  );
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;
  // Step: */N or a/N — match every N from min (or a)
  if (field.includes("/")) {
    const [head, stepStr] = field.split("/");
    const step = Number(stepStr);
    if (!Number.isFinite(step) || step <= 0) return false;
    const start = head === "*" ? min : Number(head);
    if (!Number.isFinite(start)) return false;
    return value >= start && value <= max && (value - start) % step === 0;
  }
  // Comma list of integers.
  const parts = field.split(",").map((p) => Number(p.trim()));
  return parts.includes(value);
}

/* ----------------------------- Loop -------------------------------------- */

function tick(): void {
  if (!tryAcquireLock()) return;
  try {
    const rules = listTimeBasedRules();
    let fired = 0;
    for (const r of rules) {
      try {
        if (r.event === "days-after" || r.event === "days-before") {
          fired += tickRelative(r);
        } else if (r.event === "cron") {
          fired += tickCron(r);
        }
      } catch (err) {
        console.error("[notification-scheduler] rule failure", r.id, err);
      }
    }
    if (fired > 0) {
      // eslint-disable-next-line no-console
      console.log(`[notification-scheduler] fired ${fired} time-based rule(s)`);
    }
  } finally {
    releaseLock();
  }
}

export function startNotificationScheduler(): void {
  if (started) return;
  started = true;
  running = true;
  ensureRunsTable();
  // Run a tick now so dev/tests don't have to wait a minute.
  tick();
  timer = setInterval(() => {
    if (!running) return;
    tick();
  }, TICK_MS);
}

export function stopNotificationScheduler(): void {
  running = false;
  started = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Test helper: run a single tick synchronously. */
export function runSchedulerTickForTest(): void {
  ensureRunsTable();
  tick();
}

/** Test helper: peek at a rule's history. */
export function getScheduleRunsForTest(
  ruleId: string,
): Array<{ recordId: string; scheduledFor: string; firedAt: string }> {
  ensureRunsTable();
  const rows = db
    .prepare(
      `SELECT record_id as recordId, scheduled_for as scheduledFor, fired_at as firedAt
       FROM notification_schedule_runs WHERE rule_id = ?`,
    )
    .all(ruleId) as Array<{ recordId: string; scheduledFor: string; firedAt: string }>;
  return rows;
}

/** Helper to be called from a route to manually trigger a tick. */
export function tickNow(): void {
  tick();
}

// Re-export to satisfy types for the ad-hoc dispatch helper.
export type { NotificationRule };
