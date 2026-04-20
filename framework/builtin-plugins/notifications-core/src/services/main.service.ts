import {
  compileDraft,
  createCommunicationIdempotencyKey,
  createLocalCommunicationProviderRegistry,
  createRetryDecision,
  normalizeCommunicationCallback,
  type CommunicationCallbackEvent,
  type CommunicationDeliveryFailure,
  type CommunicationDraft,
  type CommunicationProviderRegistry
} from "@platform/communication";
import type { EmailTemplateRegistry } from "@platform/email-templates";

import type {
  CancelNotificationMessageInput,
  NotificationDeliveryEndpoint,
  NotificationDeliveryPreference,
  NotificationMessageAttemptRecord,
  NotificationMessageRecord,
  QueueNotificationMessageInput,
  RegisterDeliveryEndpointInput,
  RetryNotificationMessageInput,
  TestSendNotificationMessageInput,
  UpsertDeliveryPreferenceInput
} from "../model";

export type NotificationLifecycleEvent = {
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type NotificationDispatchJob = {
  jobDefinitionId: string;
  queue: string;
  payload: Record<string, unknown>;
  runAt?: string | undefined;
};

export type NotificationQueueResult = {
  ok: true;
  message: NotificationMessageRecord;
  attempts: NotificationMessageAttemptRecord[];
  jobs: NotificationDispatchJob[];
  events: NotificationLifecycleEvent[];
};

export type NotificationDispatchResult = {
  ok: true;
  message: NotificationMessageRecord;
  attempt: NotificationMessageAttemptRecord;
  jobs: NotificationDispatchJob[];
  events: NotificationLifecycleEvent[];
};

export type CommunicationRuntime = {
  emailTemplates?: EmailTemplateRegistry | undefined;
  providers?: CommunicationProviderRegistry | undefined;
  endpoints?: NotificationDeliveryEndpoint[] | undefined;
  preferences?: NotificationDeliveryPreference[] | undefined;
};

const notificationQueueName = "notifications" as const;
const defaultMaxDeliveryAttempts = 2 as const;

export function registerDeliveryEndpoint(input: RegisterDeliveryEndpointInput): {
  ok: true;
  endpoint: NotificationDeliveryEndpoint;
} {
  const timestamp = new Date().toISOString();
  return {
    ok: true,
    endpoint: {
      id: input.endpointId,
      tenantId: input.tenantId,
      recipientRef: input.recipientRef,
      channel: input.channel,
      label: input.label,
      destinationKind: input.destinationKind,
      address: input.address,
      providerRoute: input.providerRoute,
      status: "active",
      actorId: input.actorId,
      reason: input.reason ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  };
}

export function upsertDeliveryPreference(input: UpsertDeliveryPreferenceInput): {
  ok: true;
  preference: NotificationDeliveryPreference;
} {
  const timestamp = new Date().toISOString();
  return {
    ok: true,
    preference: {
      id: input.preferenceId,
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      channel: input.channel,
      enabled: input.enabled,
      digestEnabled: input.digestEnabled,
      actorId: input.actorId,
      reason: input.reason ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  };
}

export function queueNotificationMessage(
  input: QueueNotificationMessageInput,
  runtime: CommunicationRuntime = {}
): NotificationQueueResult {
  assertSupportedDeliveryMode(input.channel, input.deliveryMode);

  const timestamp = new Date().toISOString();
  const endpoint = resolveEndpoint(input, runtime.endpoints);
  const preference = resolvePreference(input, runtime.preferences);
  const providerRoute = input.providerRoute ?? endpoint?.providerRoute ?? getDefaultProviderRoute(input.channel);
  const directAddress = input.directAddress ?? endpoint?.address ?? null;

  const message: NotificationMessageRecord = {
    id: input.messageId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    channel: input.channel,
    recipientRef: input.recipientRef,
    endpointId: input.endpointId ?? endpoint?.id ?? null,
    templateId: input.templateId ?? null,
    templateProps: input.templateProps ?? null,
    directAddress,
    title: input.title ?? null,
    bodyText: input.bodyText ?? null,
    data: input.data ?? null,
    deliveryMode: input.deliveryMode,
    priority: input.priority,
    providerRoute,
    destinationSnapshot: createDestinationSnapshot(endpoint, directAddress, providerRoute),
    idempotencyKey: input.idempotencyKey,
    status: determineQueuedStatus(input, preference),
    sendAt: input.sendAt ?? null,
    reason: input.reason ?? null,
    failureCode: null,
    failureMessage: null,
    providerMessageId: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  if (message.status === "blocked") {
    const attempt = createAttemptRecord({
      id: `${message.id}:suppressed`,
      message,
      attemptNumber: 1,
      providerRoute,
      status: "failed",
      outcomeCategory: "blocked",
      errorCode: "delivery.suppressed",
      errorMessage: "Delivery preference blocked the message"
    });

    return {
      ok: true,
      message,
      attempts: [attempt],
      jobs: [],
      events: [
        createLifecycleEvent("notifications.message.suppressed", message, {
          preferenceId: preference?.id ?? null
        })
      ]
    };
  }

  return {
    ok: true,
    message,
    attempts: [],
    jobs: [createDispatchJob(message)],
    events: [createLifecycleEvent(`notifications.message.${message.status}`, message)]
  };
}

export async function runDeliveryDispatch(input: {
  message: NotificationMessageRecord;
  attemptId: string;
  attemptNumber: number;
  emailTemplates?: EmailTemplateRegistry | undefined;
  providers?: CommunicationProviderRegistry | undefined;
  maxAttempts?: number | undefined;
}): Promise<NotificationDispatchResult> {
  const providers = input.providers ?? createLocalCommunicationProviderRegistry();
  const compiled = await compileDraft({
    draft: toCommunicationDraft(input.message),
    emailTemplates: input.emailTemplates
  });
  const deliveryResult = await providers.send({
    route: compiled.route,
    payload: compiled.payload
  });

  if (deliveryResult.kind === "delivered") {
    const deliveredAt = deliveryResult.deliveredAt ?? new Date().toISOString();
    const message = {
      ...input.message,
      status: "delivered" as const,
      providerMessageId: deliveryResult.providerMessageId ?? null,
      updatedAt: deliveredAt,
      failureCode: null,
      failureMessage: null
    };
    const attempt = createAttemptRecord({
      id: input.attemptId,
      message,
      attemptNumber: input.attemptNumber,
      providerRoute: compiled.route.id,
      status: "delivered",
      outcomeCategory: "delivered",
      providerMessageId: deliveryResult.providerMessageId,
      occurredAt: deliveredAt,
      updatedAt: deliveredAt
    });

    return {
      ok: true,
      message,
      attempt,
      jobs: [],
      events: [createLifecycleEvent("notifications.message.delivered", message)]
    };
  }

  if (deliveryResult.kind === "accepted") {
    const acceptedAt = deliveryResult.acceptedAt ?? new Date().toISOString();
    const message = {
      ...input.message,
      status: "accepted" as const,
      providerMessageId: deliveryResult.providerMessageId ?? null,
      updatedAt: acceptedAt,
      failureCode: null,
      failureMessage: null
    };
    const attempt = createAttemptRecord({
      id: input.attemptId,
      message,
      attemptNumber: input.attemptNumber,
      providerRoute: compiled.route.id,
      status: "accepted",
      outcomeCategory: "accepted",
      providerMessageId: deliveryResult.providerMessageId,
      callbackToken: deliveryResult.callbackToken,
      occurredAt: acceptedAt,
      updatedAt: acceptedAt
    });

    return {
      ok: true,
      message,
      attempt,
      jobs: [],
      events: [createLifecycleEvent("notifications.message.accepted", message)]
    };
  }

  const failureResult = deliveryResult as CommunicationDeliveryFailure;

  return handleDispatchFailure({
    message: input.message,
    attemptId: input.attemptId,
    attemptNumber: input.attemptNumber,
    providerRoute: compiled.route.id,
    result: failureResult,
    maxAttempts: input.maxAttempts ?? defaultMaxDeliveryAttempts
  });
}

export function retryNotificationMessage(
  input: RetryNotificationMessageInput
): {
  ok: true;
  message: NotificationMessageRecord;
  jobs: NotificationDispatchJob[];
  events: NotificationLifecycleEvent[];
} {
  const latestAttempt = [...input.attempts].sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
  if (!latestAttempt) {
    throw new Error("retry requires at least one previous attempt");
  }

  const decision = createRetryDecision({
    maxAttempts: input.maxAttempts,
    nextAttempt: latestAttempt.attemptNumber + 1,
    result: toFailureResult(latestAttempt)
  });

  const updatedMessage: NotificationMessageRecord = {
    ...input.message,
    status: decision.nextStatus === "queued" ? "queued" : "dead-letter",
    updatedAt: new Date().toISOString(),
    failureCode: decision.retryable ? null : latestAttempt.errorCode,
    failureMessage: decision.retryable ? null : latestAttempt.errorMessage
  };

  return {
    ok: true,
    message: updatedMessage,
    jobs: decision.retryable ? [createDispatchJob(updatedMessage, "notifications.dispatch.retry")] : [],
    events: [
      createLifecycleEvent(
        decision.retryable ? "notifications.message.retried" : "notifications.message.dead-lettered",
        updatedMessage,
        {
          actorId: input.actorId,
          reason: input.reason
        }
      )
    ]
  };
}

export function cancelNotificationMessage(
  input: CancelNotificationMessageInput
): {
  ok: true;
  message: NotificationMessageRecord;
  events: NotificationLifecycleEvent[];
} {
  if (input.message.status === "delivered") {
    throw new Error("delivered messages cannot be cancelled");
  }

  const message: NotificationMessageRecord = {
    ...input.message,
    status: "cancelled",
    updatedAt: new Date().toISOString(),
    reason: input.reason
  };

  return {
    ok: true,
    message,
    events: [
      createLifecycleEvent("notifications.message.cancelled", message, {
        actorId: input.actorId
      })
    ]
  };
}

export async function testSendNotificationMessage(
  input: TestSendNotificationMessageInput,
  runtime: CommunicationRuntime = {}
): Promise<NotificationDispatchResult> {
  const queued = queueNotificationMessage(
    {
      ...input,
      deliveryMode: "immediate",
      idempotencyKey:
        input.idempotencyKey ??
        createCommunicationIdempotencyKey({
          tenantId: input.tenantId,
          channel: input.channel,
          recipientRef: input.recipientRef,
          templateId: input.templateId,
          deliveryMode: "immediate"
        })
    },
    runtime
  );

  if (queued.message.status === "blocked") {
    const blockedAttempt = queued.attempts[0];
    if (!blockedAttempt) {
      throw new Error("blocked test sends must produce an audit attempt");
    }

    return {
      ok: true,
      message: queued.message,
      attempt: blockedAttempt,
      jobs: [],
      events: queued.events
    };
  }

  return runDeliveryDispatch({
    message: queued.message,
    attemptId: `${queued.message.id}:attempt:1`,
    attemptNumber: 1,
    emailTemplates: runtime.emailTemplates,
    providers: runtime.providers
  });
}

export function reconcileNotificationCallback(input: {
  message: NotificationMessageRecord;
  attempt: NotificationMessageAttemptRecord;
  callback: CommunicationCallbackEvent;
}): {
  ok: true;
  message: NotificationMessageRecord;
  attempt: NotificationMessageAttemptRecord;
  events: NotificationLifecycleEvent[];
} {
  if (input.callback.attemptId !== input.attempt.id) {
    throw new Error("callback attempt id does not match the target attempt");
  }

  if (input.message.status === "delivered" && input.attempt.status === "delivered") {
    return {
      ok: true,
      message: input.message,
      attempt: input.attempt,
      events: []
    };
  }

  const normalized = normalizeCommunicationCallback(input.callback);
  const message: NotificationMessageRecord = {
    ...input.message,
    status: normalized.messageStatus,
    providerMessageId: input.callback.providerMessageId ?? input.message.providerMessageId,
    failureCode: normalized.code ?? null,
    failureMessage: normalized.message ?? null,
    updatedAt: input.callback.occurredAt
  };
  const attempt: NotificationMessageAttemptRecord = {
    ...input.attempt,
    status: normalized.attemptStatus,
    outcomeCategory:
      normalized.outcomeCategory === "accepted"
        ? "accepted"
        : normalized.outcomeCategory === "delivered"
          ? "delivered"
          : "permanent-failure",
    providerMessageId: input.callback.providerMessageId ?? input.attempt.providerMessageId,
    errorCode: normalized.code ?? null,
    errorMessage: normalized.message ?? null,
    updatedAt: input.callback.occurredAt
  };

  return {
    ok: true,
    message,
    attempt,
    events:
      input.message.status === normalized.messageStatus && input.attempt.status === normalized.attemptStatus
        ? []
        : [createLifecycleEvent(`notifications.message.${normalized.messageStatus}`, message)]
  };
}

function resolveEndpoint(
  input: QueueNotificationMessageInput | TestSendNotificationMessageInput,
  endpoints: NotificationDeliveryEndpoint[] | undefined
): NotificationDeliveryEndpoint | undefined {
  if (!input.endpointId) {
    return undefined;
  }

  const endpoint = endpoints?.find((candidate) => candidate.id === input.endpointId);
  if (!endpoint) {
    throw new Error(`delivery endpoint '${input.endpointId}' was not provided in the communication runtime`);
  }

  return endpoint;
}

function resolvePreference(
  input: QueueNotificationMessageInput | TestSendNotificationMessageInput,
  preferences: NotificationDeliveryPreference[] | undefined
): NotificationDeliveryPreference | undefined {
  return preferences?.find(
    (preference) =>
      preference.tenantId === input.tenantId &&
      preference.subjectRef === input.recipientRef &&
      preference.channel === input.channel
  );
}

function determineQueuedStatus(
  input: QueueNotificationMessageInput,
  preference: NotificationDeliveryPreference | undefined
): NotificationMessageRecord["status"] {
  if (preference && !preference.enabled) {
    return "blocked";
  }
  if (input.deliveryMode === "scheduled") {
    return "scheduled";
  }
  if (input.deliveryMode === "digest") {
    return "scheduled";
  }
  return "queued";
}

function assertSupportedDeliveryMode(
  channel: NotificationMessageRecord["channel"],
  deliveryMode: NotificationMessageRecord["deliveryMode"]
): void {
  if ((channel === "sms" || channel === "push") && deliveryMode === "digest") {
    throw new Error(`digest delivery is not supported for ${channel}`);
  }
}

function createDestinationSnapshot(
  endpoint: NotificationDeliveryEndpoint | undefined,
  directAddress: string | null,
  providerRoute: string
): NotificationMessageRecord["destinationSnapshot"] {
  if (endpoint) {
    return {
      label: endpoint.label,
      destinationKind: endpoint.destinationKind,
      address: endpoint.address,
      providerRoute
    };
  }

  if (directAddress) {
    return {
      destinationKind: "direct",
      address: directAddress,
      providerRoute
    };
  }

  return {
    destinationKind: "subject-ref",
    providerRoute
  };
}

function createLifecycleEvent(
  type: string,
  message: NotificationMessageRecord,
  payload: Record<string, unknown> = {}
): NotificationLifecycleEvent {
  return {
    type,
    occurredAt: new Date().toISOString(),
    payload: {
      messageId: message.id,
      tenantId: message.tenantId,
      channel: message.channel,
      status: message.status,
      providerRoute: message.providerRoute,
      ...payload
    }
  };
}

function createDispatchJob(
  message: NotificationMessageRecord,
  jobDefinitionId?: string
): NotificationDispatchJob {
  const resolvedJobDefinitionId =
    jobDefinitionId ??
    (message.deliveryMode === "scheduled"
      ? "notifications.dispatch.scheduled"
      : message.deliveryMode === "digest"
        ? "notifications.dispatch.digest"
        : "notifications.dispatch.immediate");

  return {
    jobDefinitionId: resolvedJobDefinitionId,
    queue: notificationQueueName,
    payload: {
      messageId: message.id,
      tenantId: message.tenantId,
      channel: message.channel,
      providerRoute: message.providerRoute
    },
    runAt: message.sendAt ?? undefined
  };
}

function createAttemptRecord(input: {
  id: string;
  message: NotificationMessageRecord;
  attemptNumber: number;
  providerRoute: string;
  status: NotificationMessageAttemptRecord["status"];
  outcomeCategory: NotificationMessageAttemptRecord["outcomeCategory"];
  providerMessageId?: string | undefined;
  callbackToken?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  occurredAt?: string | undefined;
  updatedAt?: string | undefined;
}): NotificationMessageAttemptRecord {
  const occurredAt = input.occurredAt ?? new Date().toISOString();

  return {
    id: input.id,
    messageId: input.message.id,
    tenantId: input.message.tenantId,
    attemptNumber: input.attemptNumber,
    providerRoute: input.providerRoute,
    status: input.status,
    outcomeCategory: input.outcomeCategory,
    providerMessageId: input.providerMessageId ?? null,
    callbackToken: input.callbackToken ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    occurredAt,
    updatedAt: input.updatedAt ?? occurredAt
  };
}

function handleDispatchFailure(input: {
  message: NotificationMessageRecord;
  attemptId: string;
  attemptNumber: number;
  providerRoute: string;
  result: CommunicationDeliveryFailure;
  maxAttempts: number;
}): NotificationDispatchResult {
  const decision = createRetryDecision({
    maxAttempts: input.maxAttempts,
    nextAttempt: input.attemptNumber + 1,
    result: input.result
  });
  const updatedAt = new Date().toISOString();
  const message: NotificationMessageRecord = {
    ...input.message,
    status: decision.retryable ? "queued" : "dead-letter",
    failureCode: input.result.code,
    failureMessage: input.result.message,
    updatedAt
  };
  const attempt = createAttemptRecord({
    id: input.attemptId,
    message,
    attemptNumber: input.attemptNumber,
    providerRoute: input.providerRoute,
    status: "failed",
    outcomeCategory: decision.outcomeCategory,
    errorCode: input.result.code,
    errorMessage: input.result.message,
    updatedAt
  });

  return {
    ok: true,
    message,
    attempt,
    jobs: decision.retryable ? [createDispatchJob(message, "notifications.dispatch.retry")] : [],
    events: [
      createLifecycleEvent(
        decision.retryable ? "notifications.message.retry-scheduled" : "notifications.message.dead-lettered",
        message,
        {
          failureCode: input.result.code
        }
      )
    ]
  };
}

function toFailureResult(attempt: NotificationMessageAttemptRecord): CommunicationDeliveryFailure {
  switch (attempt.outcomeCategory) {
    case "timeout":
      return {
        kind: "failed",
        failureClass: "timeout",
        code: attempt.errorCode ?? "provider.timeout",
        message: attempt.errorMessage ?? "Delivery timed out",
        retryAfterMs: 500
      };
    case "transient-failure":
      return {
        kind: "failed",
        failureClass: "transient",
        code: attempt.errorCode ?? "provider.unavailable",
        message: attempt.errorMessage ?? "Provider unavailable",
        retryAfterMs: 1_000
      };
    default:
      return {
        kind: "failed",
        failureClass: "permanent",
        code: attempt.errorCode ?? "delivery.failed",
        message: attempt.errorMessage ?? "Delivery failed"
      };
  }
}

function toCommunicationDraft(message: NotificationMessageRecord): CommunicationDraft {
  switch (message.channel) {
    case "email":
      if (!message.templateId) {
        throw new Error("email messages require templateId");
      }
      return {
        messageId: message.id,
        tenantId: message.tenantId,
        channel: "email",
        recipientRef: message.recipientRef,
        deliveryMode: message.deliveryMode,
        priority: message.priority,
        idempotencyKey: message.idempotencyKey,
        providerRoute: message.providerRoute,
        endpointId: message.endpointId ?? undefined,
        directAddress: message.directAddress ?? undefined,
        sendAt: message.sendAt ?? undefined,
        reason: message.reason ?? undefined,
        templateId: message.templateId,
        templateProps: message.templateProps ?? undefined
      };
    case "sms":
      if (!message.bodyText) {
        throw new Error("sms messages require bodyText");
      }
      return {
        messageId: message.id,
        tenantId: message.tenantId,
        channel: "sms",
        recipientRef: message.recipientRef,
        deliveryMode: message.deliveryMode,
        priority: message.priority,
        idempotencyKey: message.idempotencyKey,
        providerRoute: message.providerRoute,
        endpointId: message.endpointId ?? undefined,
        directAddress: message.directAddress ?? undefined,
        sendAt: message.sendAt ?? undefined,
        reason: message.reason ?? undefined,
        bodyText: message.bodyText
      };
    case "push":
      if (!message.title || !message.bodyText) {
        throw new Error("push messages require title and bodyText");
      }
      return {
        messageId: message.id,
        tenantId: message.tenantId,
        channel: "push",
        recipientRef: message.recipientRef,
        deliveryMode: message.deliveryMode,
        priority: message.priority,
        idempotencyKey: message.idempotencyKey,
        providerRoute: message.providerRoute,
        endpointId: message.endpointId ?? undefined,
        directAddress: message.directAddress ?? undefined,
        sendAt: message.sendAt ?? undefined,
        reason: message.reason ?? undefined,
        title: message.title,
        bodyText: message.bodyText,
        data: message.data ?? undefined
      };
    case "in-app":
      if (!message.title || !message.bodyText) {
        throw new Error("in-app messages require title and bodyText");
      }
      return {
        messageId: message.id,
        tenantId: message.tenantId,
        channel: "in-app",
        recipientRef: message.recipientRef,
        deliveryMode: message.deliveryMode,
        priority: message.priority,
        idempotencyKey: message.idempotencyKey,
        providerRoute: message.providerRoute,
        endpointId: message.endpointId ?? undefined,
        directAddress: message.directAddress ?? undefined,
        sendAt: message.sendAt ?? undefined,
        reason: message.reason ?? undefined,
        title: message.title,
        bodyText: message.bodyText,
        data: message.data ?? undefined
      };
  }
}

function getDefaultProviderRoute(channel: NotificationMessageRecord["channel"]): string {
  switch (channel) {
    case "email":
      return "local-email-success";
    case "sms":
      return "local-sms-success";
    case "push":
      return "local-push-success";
    case "in-app":
      return "local-in-app-success";
  }
}
