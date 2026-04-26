/** Notification Rules runtime helpers.
 *
 *  A rule is { resource, event, condition?, channels[], subject?, body }.
 *  When a matching event fires, the rule is evaluated. If truthy, the
 *  body template is rendered against the record + context, and one
 *  delivery row per channel is queued. Channels:
 *
 *    in-app   { recipients: ["user:<id>"] | "owner" | "tenant" }
 *    email    { to: ["…"] | { fromField: "email" }, subject, html }
 *    webhook  { url, headers? }
 *    sms      { to: ["…"] }    (delivery left to the dispatcher)
 *
 *  Conditions are stored as a small JSON expression tree:
 *    { op: "and"|"or", args: [<expr>] }
 *    { op: "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"in"|"truthy"|"falsy",
 *      field: "path.to.field", value?: any }
 *
 *  Evaluation is straightforward and deterministic. Storage:
 *    notification_rules           — rule definitions
 *    notification_deliveries      — append-only delivery log
 */

import { db, nowIso } from "@gutu-host";
import { uuid } from "@gutu-host";
import { renderTemplate } from "@gutu-plugin/template-core";

export type NotificationEvent =
  | "create"
  | "update"
  | "submit"
  | "cancel"
  | "value-change"
  | "days-after"
  | "days-before"
  | "cron";

export interface ChannelDescriptor {
  kind: "in-app" | "email" | "webhook" | "sms";
  config: Record<string, unknown>;
}

export interface ConditionLeaf {
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "truthy" | "falsy";
  field: string;
  value?: unknown;
}

export interface ConditionGroup {
  op: "and" | "or";
  args: ConditionExpression[];
}

export type ConditionExpression = ConditionLeaf | ConditionGroup;

export interface NotificationRule {
  id: string;
  tenantId: string;
  name: string;
  resource: string;
  event: NotificationEvent;
  condition: ConditionExpression | null;
  triggerField: string | null;
  offsetDays: number | null;
  cronExpr: string | null;
  channels: ChannelDescriptor[];
  subject: string | null;
  bodyTemplate: string;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface Row {
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

export class NotificationRuleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "NotificationRuleError";
  }
}

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function rowToRule(r: Row): NotificationRule {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    resource: r.resource,
    event: r.event as NotificationEvent,
    condition: parseJson<ConditionExpression | null>(r.condition, null),
    triggerField: r.trigger_field,
    offsetDays: r.offset_days,
    cronExpr: r.cron_expr,
    channels: parseJson<ChannelDescriptor[]>(r.channels, []),
    subject: r.subject,
    bodyTemplate: r.body_template,
    enabled: r.enabled === 1,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listNotificationRules(tenantId: string, resource?: string): NotificationRule[] {
  const rows = resource
    ? (db
        .prepare(
          `SELECT * FROM notification_rules WHERE tenant_id = ? AND resource = ?
           ORDER BY name ASC`,
        )
        .all(tenantId, resource) as Row[])
    : (db
        .prepare(
          `SELECT * FROM notification_rules WHERE tenant_id = ?
           ORDER BY resource ASC, name ASC`,
        )
        .all(tenantId) as Row[]);
  return rows.map(rowToRule);
}

export function getNotificationRule(tenantId: string, id: string): NotificationRule | null {
  const r = db.prepare(`SELECT * FROM notification_rules WHERE id = ? AND tenant_id = ?`)
    .get(id, tenantId) as Row | undefined;
  return r ? rowToRule(r) : null;
}

export interface CreateRuleArgs {
  tenantId: string;
  name: string;
  resource: string;
  event: NotificationEvent;
  condition?: ConditionExpression | null;
  triggerField?: string | null;
  offsetDays?: number | null;
  cronExpr?: string | null;
  channels: ChannelDescriptor[];
  subject?: string | null;
  bodyTemplate: string;
  enabled?: boolean;
  createdBy: string;
}

const VALID_EVENTS: ReadonlySet<NotificationEvent> = new Set([
  "create",
  "update",
  "submit",
  "cancel",
  "value-change",
  "days-after",
  "days-before",
  "cron",
]);

function validateRule(args: Pick<CreateRuleArgs, "name" | "event" | "channels" | "bodyTemplate">): void {
  if (!args.name) throw new NotificationRuleError("invalid", "Name required");
  if (!VALID_EVENTS.has(args.event))
    throw new NotificationRuleError("invalid", `Unknown event "${args.event}"`);
  if (!args.bodyTemplate)
    throw new NotificationRuleError("invalid", "Body template required");
  if (!Array.isArray(args.channels) || args.channels.length === 0) {
    throw new NotificationRuleError("invalid", "At least one channel required");
  }
  for (const ch of args.channels) {
    if (!ch.kind || !["in-app", "email", "webhook", "sms"].includes(ch.kind)) {
      throw new NotificationRuleError("invalid", `Bad channel kind "${ch.kind}"`);
    }
  }
}

export function createNotificationRule(args: CreateRuleArgs): NotificationRule {
  validateRule(args);
  const id = uuid();
  const now = nowIso();
  db.prepare(
    `INSERT INTO notification_rules
       (id, tenant_id, name, resource, event, condition, trigger_field, offset_days, cron_expr,
        channels, subject, body_template, enabled, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    args.tenantId,
    args.name,
    args.resource,
    args.event,
    args.condition ? JSON.stringify(args.condition) : null,
    args.triggerField ?? null,
    args.offsetDays ?? null,
    args.cronExpr ?? null,
    JSON.stringify(args.channels),
    args.subject ?? null,
    args.bodyTemplate,
    args.enabled === false ? 0 : 1,
    args.createdBy,
    now,
    now,
  );
  const row = db.prepare(`SELECT * FROM notification_rules WHERE id = ?`).get(id) as Row;
  return rowToRule(row);
}

export interface UpdateRuleArgs {
  name?: string;
  event?: NotificationEvent;
  condition?: ConditionExpression | null;
  triggerField?: string | null;
  offsetDays?: number | null;
  cronExpr?: string | null;
  channels?: ChannelDescriptor[];
  subject?: string | null;
  bodyTemplate?: string;
  enabled?: boolean;
}

export function updateNotificationRule(
  tenantId: string,
  id: string,
  patch: UpdateRuleArgs,
): NotificationRule | null {
  const existing = db.prepare(`SELECT * FROM notification_rules WHERE id = ? AND tenant_id = ?`)
    .get(id, tenantId) as Row | undefined;
  if (!existing) return null;
  const fields: string[] = [];
  const args: unknown[] = [];
  const apply = (col: string, val: unknown) => {
    fields.push(`${col} = ?`);
    args.push(val);
  };
  if (patch.name !== undefined) apply("name", patch.name);
  if (patch.event !== undefined) {
    if (!VALID_EVENTS.has(patch.event))
      throw new NotificationRuleError("invalid", `Unknown event "${patch.event}"`);
    apply("event", patch.event);
  }
  if (patch.condition !== undefined)
    apply("condition", patch.condition ? JSON.stringify(patch.condition) : null);
  if (patch.triggerField !== undefined) apply("trigger_field", patch.triggerField);
  if (patch.offsetDays !== undefined) apply("offset_days", patch.offsetDays);
  if (patch.cronExpr !== undefined) apply("cron_expr", patch.cronExpr);
  if (patch.channels !== undefined) {
    if (!Array.isArray(patch.channels) || patch.channels.length === 0)
      throw new NotificationRuleError("invalid", "At least one channel required");
    apply("channels", JSON.stringify(patch.channels));
  }
  if (patch.subject !== undefined) apply("subject", patch.subject);
  if (patch.bodyTemplate !== undefined) {
    if (!patch.bodyTemplate)
      throw new NotificationRuleError("invalid", "Body template required");
    apply("body_template", patch.bodyTemplate);
  }
  if (patch.enabled !== undefined) apply("enabled", patch.enabled ? 1 : 0);
  if (fields.length === 0) return rowToRule(existing);
  fields.push("updated_at = ?");
  args.push(nowIso());
  args.push(id);
  db.prepare(`UPDATE notification_rules SET ${fields.join(", ")} WHERE id = ?`).run(...args);
  const row = db.prepare(`SELECT * FROM notification_rules WHERE id = ?`).get(id) as Row;
  return rowToRule(row);
}

export function deleteNotificationRule(tenantId: string, id: string): boolean {
  const r = db.prepare(`DELETE FROM notification_rules WHERE id = ? AND tenant_id = ?`)
    .run(id, tenantId);
  return r.changes > 0;
}

/* ----------------------------- Evaluation -------------------------------- */

function lookup(path: string, ctx: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function evaluateCondition(
  expr: ConditionExpression | null,
  ctx: Record<string, unknown>,
): boolean {
  if (!expr) return true;
  if ("args" in expr) {
    if (expr.op === "and") return expr.args.every((a) => evaluateCondition(a, ctx));
    if (expr.op === "or") return expr.args.some((a) => evaluateCondition(a, ctx));
    return false;
  }
  const left = lookup(expr.field, ctx);
  switch (expr.op) {
    case "eq":
      return left === expr.value;
    case "neq":
      return left !== expr.value;
    case "gt":
      return Number(left) > Number(expr.value);
    case "gte":
      return Number(left) >= Number(expr.value);
    case "lt":
      return Number(left) < Number(expr.value);
    case "lte":
      return Number(left) <= Number(expr.value);
    case "in":
      return Array.isArray(expr.value) && expr.value.includes(left);
    case "truthy":
      return isTruthy(left);
    case "falsy":
      return !isTruthy(left);
  }
}

/* ----------------------------- Dispatch ---------------------------------- */

export interface FireEventInput {
  tenantId: string;
  resource: string;
  event: NotificationEvent;
  recordId: string;
  record: Record<string, unknown>;
  /** For 'value-change' event we also accept the previous record. */
  previous?: Record<string, unknown>;
  /** Extra context (actor, company, etc). */
  context?: Record<string, unknown>;
}

export interface DispatchResult {
  fired: number;
  deliveries: number;
}

/** Fire all enabled rules matching the event. Returns counts. The
 *  caller (the resource POST/PATCH handler) is expected to call this
 *  after the write succeeded — failures here never block writes. */
export function fireEvent(input: FireEventInput): DispatchResult {
  const rules = db
    .prepare(
      `SELECT * FROM notification_rules
       WHERE tenant_id = ? AND resource = ? AND event = ? AND enabled = 1`,
    )
    .all(input.tenantId, input.resource, input.event) as Row[];
  let fired = 0;
  let deliveries = 0;
  for (const r of rules) {
    const rule = rowToRule(r);
    const condCtx = {
      record: input.record,
      previous: input.previous ?? null,
      ...input.record,
      ...(input.context ?? {}),
    };
    if (!evaluateCondition(rule.condition, condCtx)) continue;
    fired++;
    deliveries += enqueueDeliveries(rule, input);
  }
  return { fired, deliveries };
}

function enqueueDeliveries(rule: NotificationRule, input: FireEventInput): number {
  let count = 0;
  const ctx = {
    record: input.record,
    ...input.record,
    ...(input.context ?? {}),
    now: new Date().toISOString(),
  };
  const subject = rule.subject ? renderTemplate(rule.subject, ctx, {}).output : "";
  const body = renderTemplate(rule.bodyTemplate, ctx, {}).output;
  for (const channel of rule.channels) {
    const id = uuid();
    const now = nowIso();
    const payload = {
      subject,
      body,
      channelConfig: channel.config,
      recipients: extractRecipients(channel, input),
    };
    db.prepare(
      `INSERT INTO notification_deliveries
         (id, tenant_id, rule_id, resource, record_id, channel, status, attempts, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    ).run(
      id,
      input.tenantId,
      rule.id,
      input.resource,
      input.recordId,
      channel.kind,
      JSON.stringify(payload),
      now,
      now,
    );
    count++;
  }
  return count;
}

function extractRecipients(
  channel: ChannelDescriptor,
  input: FireEventInput,
): string[] {
  const cfg = channel.config ?? {};
  const list: string[] = [];
  if (Array.isArray(cfg.recipients)) list.push(...(cfg.recipients as string[]));
  if (Array.isArray(cfg.to)) list.push(...(cfg.to as string[]));
  if (typeof cfg.fromField === "string") {
    const v = (input.record as Record<string, unknown>)[cfg.fromField];
    if (typeof v === "string") list.push(v);
  }
  return list;
}

/** List the most recent deliveries for a record (used by detail page). */
export function recentDeliveriesFor(
  tenantId: string,
  resource: string,
  recordId: string,
  limit = 25,
): Array<Record<string, unknown>> {
  const rows = db.prepare(
    `SELECT * FROM notification_deliveries
     WHERE tenant_id = ? AND resource = ? AND record_id = ?
     ORDER BY created_at DESC LIMIT ?`,
  ).all(tenantId, resource, recordId, limit) as Array<{
    id: string;
    rule_id: string;
    channel: string;
    status: string;
    attempts: number;
    last_error: string | null;
    payload: string | null;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    ruleId: r.rule_id,
    channel: r.channel,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
    payload: parseJson(r.payload, null),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
