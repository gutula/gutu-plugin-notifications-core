import { describe, expect, it } from "bun:test";
import { executeAction } from "@platform/schema";
import manifest from "../../package";
import {
  queueNotificationMessageAction,
  registerDeliveryEndpointAction,
  upsertDeliveryPreferenceAction
} from "../../src/actions/default.action";
import {
  queueNotificationMessage,
  registerDeliveryEndpoint,
  upsertDeliveryPreference
} from "../../src/services/main.service";
import { buildNotificationsMigrationSql } from "../../src/postgres";

describe("plugin manifest", () => {
  it("keeps a stable package id and primary capability", () => {
    expect(manifest.id).toBe("notifications-core");
    expect(manifest.providesCapabilities).toContain("notifications.messages");
  });

  it("registers governed delivery endpoints with stable route metadata", () => {
    const result = registerDeliveryEndpoint({
      endpointId: "de57a01b-f693-47db-a4c3-a457ef1537b2",
      tenantId: "9344677c-f605-4374-9306-f2e8668f1ccd",
      actorId: "9344677c-f605-4374-9306-f2e8668f1cce",
      label: "Ada Work Email",
      channel: "email",
      recipientRef: "user:contact-42",
      destinationKind: "email-address",
      address: "ada@example.com",
      providerRoute: "local-email-success",
      reason: "primary work mailbox"
    });

    expect(result.ok).toBe(true);
    expect(result.endpoint).toMatchObject({
        id: "de57a01b-f693-47db-a4c3-a457ef1537b2",
        channel: "email",
        providerRoute: "local-email-success",
        status: "active"
    });
  });

  it("stores suppressions and digest preferences per channel", () => {
    const result = upsertDeliveryPreference({
      preferenceId: "de57a01b-f693-47db-a4c3-a457ef1537b3",
      tenantId: "9344677c-f605-4374-9306-f2e8668f1ccd",
      actorId: "9344677c-f605-4374-9306-f2e8668f1cce",
      subjectRef: "user:contact-42",
      channel: "in-app",
      enabled: false,
      digestEnabled: true,
      reason: "user muted in-app"
    });

    expect(result.ok).toBe(true);
    expect(result.preference).toMatchObject({
        id: "de57a01b-f693-47db-a4c3-a457ef1537b3",
        channel: "in-app",
        enabled: false,
        digestEnabled: true
    });
  });

  it("queues outbound messages with lifecycle state, jobs, and audit events", () => {
    const result = queueNotificationMessage({
      messageId: "de57a01b-f693-47db-a4c3-a457ef1537c1",
      tenantId: "9344677c-f605-4374-9306-f2e8668f1ccd",
      actorId: "9344677c-f605-4374-9306-f2e8668f1cce",
      channel: "email",
      recipientRef: "user:contact-42",
      directAddress: "ada@example.com",
      templateId: "notifications.invoice-ready",
      deliveryMode: "immediate",
      priority: "high",
      idempotencyKey: "invoice-ready-1"
    });

    expect(result.ok).toBe(true);
    expect(result.message).toMatchObject({
      id: "de57a01b-f693-47db-a4c3-a457ef1537c1",
      status: "queued",
      providerRoute: "local-email-success"
    });
    expect(result.jobs[0]?.jobDefinitionId).toBe("notifications.dispatch.immediate");
    expect(result.events[0]?.type).toBe("notifications.message.queued");
  });

  it("preserves contract behavior for scheduled push sends", async () => {
    const result = await executeAction(queueNotificationMessageAction, {
      messageId: "de57a01b-f693-47db-a4c3-a457ef1537d1",
      tenantId: "9344677c-f605-4374-9306-f2e8668f1ccd",
      actorId: "9344677c-f605-4374-9306-f2e8668f1cce",
      channel: "push",
      recipientRef: "device:ops-1",
      directAddress: "push-token-ops-1",
      title: "Deploy queued",
      bodyText: "The deploy is scheduled for tonight.",
      deliveryMode: "scheduled",
      priority: "normal",
      sendAt: new Date(Date.now() + 600_000).toISOString(),
      idempotencyKey: "push-scheduled-1"
    });

    expect(result.message.status).toBe("scheduled");
    expect(result.jobs[0]?.jobDefinitionId).toBe("notifications.dispatch.scheduled");
  });

  it("keeps resource preference registration available through the action contract", async () => {
    const endpoint = await executeAction(registerDeliveryEndpointAction, {
      endpointId: "de57a01b-f693-47db-a4c3-a457ef1537e1",
      tenantId: "9344677c-f605-4374-9306-f2e8668f1ccd",
      actorId: "9344677c-f605-4374-9306-f2e8668f1cce",
      label: "Ada iPhone",
      channel: "push",
      recipientRef: "user:contact-42",
      destinationKind: "push-token",
      address: "push-token-1",
      providerRoute: "local-push-success"
    });
    const preference = await executeAction(upsertDeliveryPreferenceAction, {
      preferenceId: "de57a01b-f693-47db-a4c3-a457ef1537e2",
      tenantId: "9344677c-f605-4374-9306-f2e8668f1ccd",
      actorId: "9344677c-f605-4374-9306-f2e8668f1cce",
      subjectRef: "user:contact-42",
      channel: "push",
      enabled: true,
      digestEnabled: false
    });

    expect(endpoint.endpoint.channel).toBe("push");
    expect(preference.preference.channel).toBe("push");
  });

  it("renders concrete postgres DDL without unresolved template placeholders", () => {
    const sql = buildNotificationsMigrationSql({ schemaName: "notifications_test" });
    const attemptsStatement = sql.find((statement) => statement.includes("message_attempts"));

    expect(attemptsStatement).toContain("REFERENCES notifications_test.messages(id) ON DELETE CASCADE");
    expect(attemptsStatement).not.toContain("${messagesTable}");
  });
});
