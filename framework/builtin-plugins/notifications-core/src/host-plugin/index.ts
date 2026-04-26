/** Host-plugin contribution for notifications-core.
 *
 *  Owns the notification rule schema, REST surface, and two workers:
 *    - dispatcher: subscribed to the in-process record-event bus
 *    - scheduler:  cron-style timer for time-based rules
 *
 *  Both workers are wrapped in `withLeadership()` so that horizontally-
 *  scaled instances elect a single leader and only the leader runs the
 *  cron tick / dispatch loop. The other instances stand by; if the
 *  leader crashes, the lease expires after TTL and another instance
 *  picks up. */
import type { HostPlugin } from "@gutu-host/plugin-contract";
import { withLeadership } from "@gutu-host/leader";
import { db } from "@gutu-host";

import { notificationRuleRoutes } from "./routes/notification-rules";
import { startNotificationDispatcher, stopNotificationDispatcher } from "./lib/notification-dispatcher";
import { startNotificationScheduler, stopNotificationScheduler } from "./lib/notification-scheduler";

let stopDispatcherLeader: (() => void) | null = null;
let stopSchedulerLeader: (() => void) | null = null;

/** A capability other plugins can consume via the registry instead of
 *  importing from this plugin directly. Future versions of
 *  `@gutu-plugin/workflow-core` will look this up to send notifications
 *  from a workflow action without a hard import. */
interface DispatchCapability {
  send(args: { tenantId: string; channel: "in-app" | "email" | "webhook" | "sms"; subject?: string; body: string; recipient?: string }): Promise<void>;
}

const dispatchCapability: DispatchCapability = {
  async send(args) {
    // Defers to the dispatcher's underlying delivery primitives.
    // Kept thin here so a different notification implementation can
    // ship the same shape and consumers don't notice the swap.
    const { default: deliver } = await import("./lib/notification-dispatcher");
    if (typeof (deliver as any)?.directSend === "function") {
      await (deliver as any).directSend(args);
    } else {
      // Fallback: write a delivery row marked "external-trigger"
      // for the scheduler/worker to pick up.
      db.prepare(
        `INSERT INTO notification_deliveries (id, tenant_id, channel, status, payload, created_at)
         VALUES (lower(hex(randomblob(16))), ?, ?, 'pending', json(?), datetime('now'))`,
      ).run(args.tenantId, args.channel, JSON.stringify(args));
    }
  },
};

export const hostPlugin: HostPlugin = {
  id: "notifications-core",
  version: "1.0.0",
  manifest: {
    label: "Notifications",
    description: "Event-driven notification rules + cron-based time-rules + dispatch workers (in-app, email, webhook, SMS).",
    icon: "Bell",
    vendor: "gutu",
    permissions: ["db.read", "db.write", "audit.write", "events.subscribe", "net.outbound"],
  },
  dependsOn: [{ id: "template-core", versionRange: "^1.0.0" }],
  provides: ["notifications.dispatch"],
  routes: [
    { mountPath: "/notification-rules", router: notificationRuleRoutes },
  ],
  start: (ctx) => {
    // Publish the dispatch capability to the cross-plugin registry so
    // other plugins (workflow actions, integration triggers, AI assist
    // alerts, …) can `ctx.registries.ns("notifications.dispatch").lookup("default")`
    // and send a notification without importing this plugin directly.
    ctx.registries.ns<DispatchCapability>("notifications.dispatch").register("default", dispatchCapability);

    stopDispatcherLeader = withLeadership("notifications:dispatcher", () => {
      startNotificationDispatcher();
      return () => stopNotificationDispatcher();
    });
    stopSchedulerLeader = withLeadership("notifications:scheduler", () => {
      startNotificationScheduler();
      return () => stopNotificationScheduler();
    });
  },
  stop: () => {
    stopSchedulerLeader?.();
    stopDispatcherLeader?.();
    stopSchedulerLeader = null;
    stopDispatcherLeader = null;
  },
  health: async () => ({ ok: true, details: { provides: ["notifications.dispatch"] } }),
};

// Re-export the lib API so other plugins can `import` from
// "@gutu-plugin/notifications-core".
export * from "./lib";
