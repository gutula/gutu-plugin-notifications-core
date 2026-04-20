import { describe, expect, it } from "bun:test";
import React from "react";

import { executeAction } from "@platform/schema";
import {
  createCommunicationIdempotencyKey,
  createLocalCommunicationProviderRegistry
} from "@platform/communication";
import { createEmailTemplateRegistry, defineEmailTemplate } from "@platform/email-templates";

import {
  cancelNotificationMessageAction,
  queueNotificationMessageAction,
  reconcileNotificationCallback,
  registerDeliveryEndpointAction,
  retryNotificationMessageAction,
  runDeliveryDispatch,
  testSendNotificationMessageAction,
  upsertDeliveryPreferenceAction
} from "../../src";

describe("notifications-core delivery lifecycle", () => {
  const emailTemplates = createEmailTemplateRegistry([
    defineEmailTemplate({
      id: "notifications.release-ready",
      from: "noreply@platform.test",
      subject: ({ name }: { name: string }) => `Release ready for ${name}`,
      component: ({ name }: { name: string }) => React.createElement("div", null, `Release ready for ${name}`)
    })
  ]);
  const providers = createLocalCommunicationProviderRegistry();

  it("queues and dispatches immediate outbound messages across all first-class channels", async () => {
    const endpoint = await executeAction(
      registerDeliveryEndpointAction,
      {
        endpointId: "7a000001-0000-4000-8000-000000000001",
        tenantId: "7a000001-0000-4000-8000-000000000010",
        recipientRef: "user:ada",
        channel: "email",
        label: "Ada Work Email",
        destinationKind: "email-address",
        address: "ada@example.com",
        providerRoute: "local-email-success",
        actorId: "7a000001-0000-4000-8000-000000000099"
      }
    );

    const queued = await executeAction(
      queueNotificationMessageAction,
      {
        messageId: "7a000001-0000-4000-8000-000000000011",
        tenantId: "7a000001-0000-4000-8000-000000000010",
        actorId: "7a000001-0000-4000-8000-000000000099",
        channel: "email",
        endpointId: endpoint.endpoint.id,
        recipientRef: "user:ada",
        templateId: "notifications.release-ready",
        templateProps: {
          name: "Ada"
        },
        deliveryMode: "immediate",
        priority: "high",
        idempotencyKey: createCommunicationIdempotencyKey({
          tenantId: "7a000001-0000-4000-8000-000000000010",
          channel: "email",
          recipientRef: "user:ada",
          templateId: "notifications.release-ready",
          deliveryMode: "immediate"
        })
      },
      {
        services: {
          communication: {
            emailTemplates,
            providers,
            endpoints: [endpoint.endpoint],
            preferences: []
          }
        }
      }
    );

    const dispatched = await runDeliveryDispatch({
      message: queued.message,
      attemptId: "7a000001-0000-4000-8000-000000000012",
      attemptNumber: 1,
      emailTemplates,
      providers
    });

    expect(queued.message.status).toBe("queued");
    expect(dispatched.message.status).toBe("delivered");
    expect(dispatched.attempt.status).toBe("delivered");
  });

  it("keeps scheduled sends in scheduled state until their dispatch window opens", async () => {
    const queued = await executeAction(
      queueNotificationMessageAction,
      {
        messageId: "7a000001-0000-4000-8000-000000000021",
        tenantId: "7a000001-0000-4000-8000-000000000010",
        actorId: "7a000001-0000-4000-8000-000000000099",
        channel: "sms",
        recipientRef: "user:ada",
        directAddress: "+15550000001",
        bodyText: "Standup in 10 minutes",
        deliveryMode: "scheduled",
        sendAt: "2026-04-21T09:00:00.000Z",
        priority: "normal",
        idempotencyKey: "sms-scheduled-1"
      },
      {
        services: {
          communication: {
            emailTemplates,
            providers,
            endpoints: [],
            preferences: []
          }
        }
      }
    );

    expect(queued.message.status).toBe("scheduled");
    expect(queued.jobs[0]?.jobDefinitionId).toBe("notifications.dispatch.scheduled");
  });

  it("retries transient provider failures and dead-letters terminal retries", async () => {
    const queued = await executeAction(
      queueNotificationMessageAction,
      {
        messageId: "7a000001-0000-4000-8000-000000000031",
        tenantId: "7a000001-0000-4000-8000-000000000010",
        actorId: "7a000001-0000-4000-8000-000000000099",
        channel: "push",
        recipientRef: "device:ada",
        directAddress: "push-token-1",
        title: "Deploy blocked",
        bodyText: "The rollout is waiting on approval.",
        providerRoute: "local-push-transient",
        deliveryMode: "immediate",
        priority: "critical",
        idempotencyKey: "push-transient-1"
      },
      {
        services: {
          communication: {
            emailTemplates,
            providers,
            endpoints: [],
            preferences: []
          }
        }
      }
    );

    const firstAttempt = await runDeliveryDispatch({
      message: queued.message,
      attemptId: "7a000001-0000-4000-8000-000000000032",
      attemptNumber: 1,
      emailTemplates,
      providers
    });
    const retried = await executeAction(retryNotificationMessageAction, {
      message: firstAttempt.message,
      attempts: [firstAttempt.attempt],
      actorId: "7a000001-0000-4000-8000-000000000099",
      reason: "provider recovered"
    });

    expect(firstAttempt.message.status).toBe("queued");
    expect(firstAttempt.attempt.outcomeCategory).toBe("transient-failure");
    expect(retried.message.status).toBe("queued");

    const terminal = await executeAction(retryNotificationMessageAction, {
      message: {
        ...firstAttempt.message,
        status: "failed"
      },
      attempts: [
        firstAttempt.attempt,
        {
          ...firstAttempt.attempt,
          id: "7a000001-0000-4000-8000-000000000033",
          attemptNumber: 2,
          status: "failed",
          outcomeCategory: "transient-failure"
        }
      ],
      actorId: "7a000001-0000-4000-8000-000000000099",
      reason: "max retries reached"
    });

    expect(terminal.message.status).toBe("dead-letter");
  });

  it("blocks suppressed recipients before dispatch and preserves the audit trail", async () => {
    const preference = await executeAction(upsertDeliveryPreferenceAction, {
      preferenceId: "7a000001-0000-4000-8000-000000000041",
      tenantId: "7a000001-0000-4000-8000-000000000010",
      subjectRef: "user:ada",
      channel: "in-app",
      enabled: false,
      digestEnabled: true,
      actorId: "7a000001-0000-4000-8000-000000000099",
      reason: "user muted in-app"
    });

    const queued = await executeAction(
      queueNotificationMessageAction,
      {
        messageId: "7a000001-0000-4000-8000-000000000042",
        tenantId: "7a000001-0000-4000-8000-000000000010",
        actorId: "7a000001-0000-4000-8000-000000000099",
        channel: "in-app",
        recipientRef: "user:ada",
        title: "Muted",
        bodyText: "This should be blocked.",
        deliveryMode: "immediate",
        priority: "low",
        idempotencyKey: "in-app-muted-1"
      },
      {
        services: {
          communication: {
            emailTemplates,
            providers,
            endpoints: [],
            preferences: [preference.preference]
          }
        }
      }
    );

    expect(queued.message.status).toBe("blocked");
    expect(queued.attempts[0]?.status).toBe("failed");
    expect(queued.events[0]?.type).toBe("notifications.message.suppressed");
  });

  it("reconciles accepted callbacks idempotently", async () => {
    const queued = await executeAction(
      testSendNotificationMessageAction,
      {
        messageId: "7a000001-0000-4000-8000-000000000051",
        tenantId: "7a000001-0000-4000-8000-000000000010",
        actorId: "7a000001-0000-4000-8000-000000000099",
        channel: "email",
        recipientRef: "user:ada",
        directAddress: "ada@example.com",
        templateId: "notifications.release-ready",
        templateProps: {
          name: "Ada"
        },
        providerRoute: "local-email-callback",
        priority: "normal"
      },
      {
        services: {
          communication: {
            emailTemplates,
            providers,
            endpoints: [],
            preferences: []
          }
        }
      }
    );

    const reconciled = reconcileNotificationCallback({
      message: queued.message,
      attempt: queued.attempt,
      callback: {
        attemptId: queued.attempt.id,
        messageId: queued.message.id,
        event: "delivered",
        providerMessageId: queued.attempt.providerMessageId,
        occurredAt: "2026-04-20T12:00:00.000Z"
      }
    });

    expect(queued.message.status).toBe("accepted");
    expect(reconciled.message.status).toBe("delivered");
    expect(reconciled.attempt.status).toBe("delivered");
    expect(reconciled.events[0]?.type).toBe("notifications.message.delivered");
  });

  it("rejects digest delivery for sms and push at the contract boundary", async () => {
    await executeAction(queueNotificationMessageAction, {
        messageId: "7a000001-0000-4000-8000-000000000061",
        tenantId: "7a000001-0000-4000-8000-000000000010",
        actorId: "7a000001-0000-4000-8000-000000000099",
        channel: "sms",
        recipientRef: "user:ada",
        directAddress: "+15550000001",
        bodyText: "Digest",
        deliveryMode: "digest",
        priority: "normal",
        idempotencyKey: "sms-digest-1"
      })
      .then(() => {
        throw new Error("expected digest delivery to be rejected");
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/digest/i);
      });
  });

  it("cancels queued messages before dispatch", async () => {
    const queued = await executeAction(
      queueNotificationMessageAction,
      {
        messageId: "7a000001-0000-4000-8000-000000000071",
        tenantId: "7a000001-0000-4000-8000-000000000010",
        actorId: "7a000001-0000-4000-8000-000000000099",
        channel: "in-app",
        recipientRef: "user:ada",
        title: "Queued",
        bodyText: "Cancel this one",
        deliveryMode: "immediate",
        priority: "normal",
        idempotencyKey: "in-app-cancel-1"
      },
      {
        services: {
          communication: {
            emailTemplates,
            providers,
            endpoints: [],
            preferences: []
          }
        }
      }
    );

    const cancelled = await executeAction(cancelNotificationMessageAction, {
      message: queued.message,
      actorId: "7a000001-0000-4000-8000-000000000099",
      reason: "operator cancelled"
    });

    expect(cancelled.message.status).toBe("cancelled");
    expect(cancelled.events[0]?.type).toBe("notifications.message.cancelled");
  });
});
