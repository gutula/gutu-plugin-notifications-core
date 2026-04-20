import { defineAction } from "@platform/schema";
import { z } from "zod";

import {
  cancelNotificationMessageInputSchema,
  notificationDeliveryEndpointSchema,
  notificationDeliveryPreferenceSchema,
  notificationMessageAttemptSchema,
  notificationMessageSchema,
  queueNotificationMessageInputSchema,
  registerDeliveryEndpointInputSchema,
  retryNotificationMessageInputSchema,
  testSendNotificationMessageInputSchema,
  upsertDeliveryPreferenceInputSchema
} from "../model";
import {
  cancelNotificationMessage,
  queueNotificationMessage,
  retryNotificationMessage,
  registerDeliveryEndpoint,
  testSendNotificationMessage,
  upsertDeliveryPreference
} from "../services/main.service";

const notificationLifecycleEventSchema = z.object({
  type: z.string().min(2),
  occurredAt: z.string(),
  payload: z.record(z.string(), z.unknown())
});

const notificationDispatchJobSchema = z.object({
  jobDefinitionId: z.string().min(2),
  queue: z.string().min(2),
  payload: z.record(z.string(), z.unknown()),
  runAt: z.string().optional()
});

const queueNotificationMessageOutputSchema = z.object({
  ok: z.literal(true),
  message: notificationMessageSchema,
  attempts: z.array(notificationMessageAttemptSchema),
  jobs: z.array(notificationDispatchJobSchema),
  events: z.array(notificationLifecycleEventSchema)
});

const dispatchNotificationMessageOutputSchema = z.object({
  ok: z.literal(true),
  message: notificationMessageSchema,
  attempt: notificationMessageAttemptSchema,
  jobs: z.array(notificationDispatchJobSchema),
  events: z.array(notificationLifecycleEventSchema)
});

export const registerDeliveryEndpointAction = defineAction({
  id: "notifications.delivery-endpoints.register",
  description: "Register a governed delivery endpoint that can be reused across outbound messages.",
  businessPurpose: "Persist reviewed delivery destinations separately from message records while preserving immutable message snapshots.",
  input: registerDeliveryEndpointInputSchema,
  output: z.object({
    ok: z.literal(true),
    endpoint: notificationDeliveryEndpointSchema
  }),
  permission: "notifications.delivery-endpoints.register",
  idempotent: true,
  audit: true,
  handler: ({ input }) => registerDeliveryEndpoint(input)
});

export const upsertDeliveryPreferenceAction = defineAction({
  id: "notifications.delivery-preferences.upsert",
  description: "Store channel-level enablement and digest preferences for a subject.",
  businessPurpose: "Allow operators and products to suppress or aggregate communications before any provider dispatch happens.",
  input: upsertDeliveryPreferenceInputSchema,
  output: z.object({
    ok: z.literal(true),
    preference: notificationDeliveryPreferenceSchema
  }),
  permission: "notifications.delivery-preferences.upsert",
  idempotent: true,
  audit: true,
  handler: ({ input }) => upsertDeliveryPreference(input)
});

export const queueNotificationMessageAction = defineAction({
  id: "notifications.messages.queue",
  description: "Queue, schedule, or suppress a notification message before provider dispatch.",
  businessPurpose: "Create the canonical communication record with lifecycle state, jobs, and audit events.",
  input: queueNotificationMessageInputSchema,
  output: queueNotificationMessageOutputSchema,
  permission: "notifications.messages.queue",
  idempotent: true,
  audit: true,
  handler: ({ input, services }) =>
    queueNotificationMessage(input, services?.communication as Parameters<typeof queueNotificationMessage>[1])
});

export const retryNotificationMessageAction = defineAction({
  id: "notifications.messages.retry",
  description: "Retry a previously failed notification message when the failure mode is recoverable.",
  businessPurpose: "Allow operator or workflow retries without hiding transient provider failures or violating max-attempt policy.",
  input: retryNotificationMessageInputSchema,
  output: z.object({
    ok: z.literal(true),
    message: notificationMessageSchema,
    jobs: z.array(notificationDispatchJobSchema),
    events: z.array(notificationLifecycleEventSchema)
  }),
  permission: "notifications.messages.retry",
  idempotent: true,
  audit: true,
  handler: ({ input }) => retryNotificationMessage(input)
});

export const cancelNotificationMessageAction = defineAction({
  id: "notifications.messages.cancel",
  description: "Cancel a queued or scheduled message before it is delivered.",
  businessPurpose: "Stop outbound delivery while preserving an auditable message record and operator context.",
  input: cancelNotificationMessageInputSchema,
  output: z.object({
    ok: z.literal(true),
    message: notificationMessageSchema,
    events: z.array(notificationLifecycleEventSchema)
  }),
  permission: "notifications.messages.cancel",
  idempotent: true,
  audit: true,
  handler: ({ input }) => cancelNotificationMessage(input)
});

export const testSendNotificationMessageAction = defineAction({
  id: "notifications.messages.test-send",
  description: "Send a one-off test message through the deterministic local provider path.",
  businessPurpose: "Exercise communication compilation and provider dispatch without needing live third-party credentials.",
  input: testSendNotificationMessageInputSchema,
  output: dispatchNotificationMessageOutputSchema,
  permission: "notifications.messages.test-send",
  idempotent: true,
  audit: true,
  handler: ({ input, services }) =>
    testSendNotificationMessage(input, services?.communication as Parameters<typeof testSendNotificationMessage>[1])
});

export const notificationActions = [
  registerDeliveryEndpointAction,
  upsertDeliveryPreferenceAction,
  queueNotificationMessageAction,
  retryNotificationMessageAction,
  cancelNotificationMessageAction,
  testSendNotificationMessageAction
] as const;
