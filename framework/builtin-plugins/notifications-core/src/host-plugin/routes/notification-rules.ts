/** Notification Rule REST API.
 *
 *  Routes:
 *    GET    /                       all rules for the tenant
 *    GET    /:resource              rules for one resource
 *    GET    /:resource/:id          single rule
 *    POST   /:resource              create
 *    PATCH  /:resource/:id          update
 *    DELETE /:resource/:id          delete
 *    POST   /:resource/:id/test     dry-run a rule against a payload
 *    GET    /:resource/:recordId/deliveries  recent deliveries for a record
 */
import { Hono } from "@gutu-host";
import { requireAuth, currentUser } from "@gutu-host";
import { getTenantContext } from "@gutu-host";
import {
  NotificationRuleError,
  createNotificationRule,
  deleteNotificationRule,
  evaluateCondition,
  fireEvent,
  getNotificationRule,
  listNotificationRules,
  recentDeliveriesFor,
  updateNotificationRule,
} from "@gutu-plugin/notifications-core";
import { renderTemplate } from "@gutu-plugin/template-core";
import {
  drainOnce,
  replayDelivery,
  suppressDelivery,
} from "@gutu-plugin/notifications-core";
import { tickNow } from "@gutu-plugin/notifications-core";
import { recordAudit } from "@gutu-host";
import { db } from "@gutu-host";

export const notificationRuleRoutes = new Hono();
notificationRuleRoutes.use("*", requireAuth);

function tenantId(): string {
  return getTenantContext()?.tenantId ?? "default";
}

notificationRuleRoutes.get("/", (c) => c.json({ rows: listNotificationRules(tenantId()) }));

notificationRuleRoutes.get("/:resource", (c) => {
  const r = c.req.param("resource");
  if (r === "deliveries") return c.json({ error: "use /:resource/:recordId/deliveries" }, 400);
  return c.json({ rows: listNotificationRules(tenantId(), r) });
});

notificationRuleRoutes.get("/:resource/:id", (c) => {
  const id = c.req.param("id");
  const rule = getNotificationRule(tenantId(), id);
  if (!rule) return c.json({ error: "not found" }, 404);
  return c.json(rule);
});

notificationRuleRoutes.post("/:resource", async (c) => {
  const resource = c.req.param("resource");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const user = currentUser(c);
  try {
    const rule = createNotificationRule({
      tenantId: tenantId(),
      resource,
      name: String(body.name ?? ""),
      event: body.event as never,
      condition: (body.condition ?? null) as never,
      triggerField: body.triggerField as string | undefined,
      offsetDays: body.offsetDays as number | undefined,
      cronExpr: body.cronExpr as string | undefined,
      channels: (body.channels ?? []) as never,
      subject: body.subject as string | undefined,
      bodyTemplate: String(body.bodyTemplate ?? ""),
      enabled: body.enabled !== false,
      createdBy: user.email,
    });
    recordAudit({
      actor: user.email,
      action: "notification-rule.created",
      resource: "notification-rule",
      recordId: rule.id,
      payload: { resource, name: rule.name },
    });
    return c.json(rule, 201);
  } catch (err) {
    if (err instanceof NotificationRuleError)
      return c.json({ error: err.message, code: err.code }, 400);
    throw err;
  }
});

notificationRuleRoutes.patch("/:resource/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as never;
  try {
    const updated = updateNotificationRule(tenantId(), c.req.param("id"), body);
    if (!updated) return c.json({ error: "not found" }, 404);
    return c.json(updated);
  } catch (err) {
    if (err instanceof NotificationRuleError)
      return c.json({ error: err.message, code: err.code }, 400);
    throw err;
  }
});

notificationRuleRoutes.delete("/:resource/:id", (c) => {
  const ok = deleteNotificationRule(tenantId(), c.req.param("id"));
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

notificationRuleRoutes.post("/:resource/:id/test", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    record?: Record<string, unknown>;
    fire?: boolean;
  };
  const rule = getNotificationRule(tenantId(), c.req.param("id"));
  if (!rule) return c.json({ error: "not found" }, 404);
  const record = body.record ?? {};
  const ctx = { record, ...record };
  const matched = evaluateCondition(rule.condition, ctx);
  const subject = rule.subject ? renderTemplate(rule.subject, ctx, {}) : null;
  const bodyRender = renderTemplate(rule.bodyTemplate, ctx, {});
  let dispatch = null;
  if (matched && body.fire) {
    dispatch = fireEvent({
      tenantId: tenantId(),
      resource: rule.resource,
      event: rule.event,
      recordId: typeof record.id === "string" ? record.id : "test",
      record,
    });
  }
  return c.json({
    matched,
    subject: subject?.output ?? null,
    body: bodyRender.output,
    errors: [...(subject?.errors ?? []), ...bodyRender.errors],
    dispatch,
  });
});

notificationRuleRoutes.get("/:resource/:recordId/deliveries", (c) => {
  const resource = c.req.param("resource");
  const recordId = c.req.param("recordId");
  return c.json({
    rows: recentDeliveriesFor(tenantId(), resource, recordId),
  });
});

/* --- Operational: deliveries inbox + replay/suppress + manual tick ---- */

notificationRuleRoutes.get("/_deliveries", (c) => {
  // Tenant-wide delivery log, paginated. Supports a status filter.
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  let rows: unknown[];
  if (status) {
    rows = db
      .prepare(
        `SELECT id, rule_id as ruleId, resource, record_id as recordId, channel,
                status, attempts, last_error as lastError, payload,
                created_at as createdAt, updated_at as updatedAt
           FROM notification_deliveries
          WHERE tenant_id = ? AND status = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?`,
      )
      .all(tenantId(), status, limit, offset);
  } else {
    rows = db
      .prepare(
        `SELECT id, rule_id as ruleId, resource, record_id as recordId, channel,
                status, attempts, last_error as lastError, payload,
                created_at as createdAt, updated_at as updatedAt
           FROM notification_deliveries
          WHERE tenant_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?`,
      )
      .all(tenantId(), limit, offset);
  }
  return c.json({ rows, limit, offset });
});

notificationRuleRoutes.post("/_deliveries/:id/replay", (c) => {
  const id = c.req.param("id");
  const ok = replayDelivery(tenantId(), id);
  if (!ok) return c.json({ error: "not found" }, 404);
  const user = currentUser(c);
  recordAudit({
    actor: user.email,
    action: "notification-delivery.replayed",
    resource: "notification-delivery",
    recordId: id,
  });
  return c.json({ ok: true });
});

notificationRuleRoutes.post("/_deliveries/:id/suppress", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const ok = suppressDelivery(tenantId(), id, body.reason ?? "Suppressed by admin");
  if (!ok) return c.json({ error: "not found or already non-pending" }, 404);
  const user = currentUser(c);
  recordAudit({
    actor: user.email,
    action: "notification-delivery.suppressed",
    resource: "notification-delivery",
    recordId: id,
    payload: { reason: body.reason ?? null },
  });
  return c.json({ ok: true });
});

notificationRuleRoutes.post("/_drain", async (c) => {
  const result = await drainOnce(200);
  return c.json(result);
});

notificationRuleRoutes.post("/_tick", (c) => {
  tickNow();
  return c.json({ ok: true });
});
