import {
  communicationChannelValues,
  communicationDeliveryModeValues,
  communicationPriorityValues
} from "@platform/communication";
import { z } from "zod";

export const notificationEndpointStatusValues = ["active", "disabled"] as const;
export const notificationMessageStatusValues = [
  "queued",
  "scheduled",
  "sending",
  "accepted",
  "delivered",
  "failed",
  "blocked",
  "cancelled",
  "dead-letter"
] as const;
export const notificationAttemptStatusValues = ["sending", "accepted", "delivered", "failed"] as const;
export const notificationAttemptOutcomeValues = [
  "accepted",
  "delivered",
  "timeout",
  "transient-failure",
  "permanent-failure",
  "blocked"
] as const;

const metadataRecordSchema = z.record(z.string(), z.unknown());

export const notificationDestinationSnapshotSchema = z.object({
  label: z.string().min(1).optional(),
  destinationKind: z.string().min(2).optional(),
  address: z.string().min(2).optional(),
  providerRoute: z.string().min(2).optional()
});

export const notificationDeliveryEndpointSchema = z.object({
  id: z.string().min(2),
  tenantId: z.string().min(2),
  recipientRef: z.string().min(2),
  channel: z.enum(communicationChannelValues),
  label: z.string().min(2),
  destinationKind: z.string().min(2),
  address: z.string().min(2),
  providerRoute: z.string().min(2),
  status: z.enum(notificationEndpointStatusValues),
  actorId: z.string().min(2),
  reason: z.string().min(3).nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const notificationDeliveryPreferenceSchema = z.object({
  id: z.string().min(2),
  tenantId: z.string().min(2),
  subjectRef: z.string().min(2),
  channel: z.enum(communicationChannelValues),
  enabled: z.boolean(),
  digestEnabled: z.boolean(),
  actorId: z.string().min(2),
  reason: z.string().min(3).nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const notificationMessageSchema = z.object({
  id: z.string().min(2),
  tenantId: z.string().min(2),
  actorId: z.string().min(2),
  channel: z.enum(communicationChannelValues),
  recipientRef: z.string().min(2),
  endpointId: z.string().min(2).nullable(),
  templateId: z.string().min(2).nullable(),
  templateProps: metadataRecordSchema.nullable(),
  directAddress: z.string().min(2).nullable(),
  title: z.string().min(1).nullable(),
  bodyText: z.string().min(1).nullable(),
  data: metadataRecordSchema.nullable(),
  deliveryMode: z.enum(communicationDeliveryModeValues),
  priority: z.enum(communicationPriorityValues),
  providerRoute: z.string().min(2),
  destinationSnapshot: notificationDestinationSnapshotSchema.nullable(),
  idempotencyKey: z.string().min(3),
  status: z.enum(notificationMessageStatusValues),
  sendAt: z.string().datetime().nullable(),
  reason: z.string().min(3).nullable(),
  failureCode: z.string().min(2).nullable(),
  failureMessage: z.string().min(2).nullable(),
  providerMessageId: z.string().min(2).nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const notificationMessageAttemptSchema = z.object({
  id: z.string().min(2),
  messageId: z.string().min(2),
  tenantId: z.string().min(2),
  attemptNumber: z.number().int().positive(),
  providerRoute: z.string().min(2),
  status: z.enum(notificationAttemptStatusValues),
  outcomeCategory: z.enum(notificationAttemptOutcomeValues),
  providerMessageId: z.string().min(2).nullable(),
  callbackToken: z.string().min(2).nullable(),
  errorCode: z.string().min(2).nullable(),
  errorMessage: z.string().min(2).nullable(),
  occurredAt: z.string(),
  updatedAt: z.string()
});

const queueBaseSchema = z.object({
  messageId: z.string().min(2),
  tenantId: z.string().min(2),
  actorId: z.string().min(2),
  channel: z.enum(communicationChannelValues),
  recipientRef: z.string().min(2),
  endpointId: z.string().min(2).optional(),
  directAddress: z.string().min(2).optional(),
  templateId: z.string().min(2).optional(),
  templateProps: metadataRecordSchema.optional(),
  title: z.string().min(1).optional(),
  bodyText: z.string().min(1).optional(),
  data: metadataRecordSchema.optional(),
  providerRoute: z.string().min(2).optional(),
  deliveryMode: z.enum(communicationDeliveryModeValues).default("immediate"),
  priority: z.enum(communicationPriorityValues).default("normal"),
  sendAt: z.string().datetime().optional(),
  idempotencyKey: z.string().min(3),
  reason: z.string().min(3).optional()
});

export const queueNotificationMessageInputSchema = queueBaseSchema.superRefine((input, ctx) => {
  validateNotificationMessageInput(input, ctx);
});

export const testSendNotificationMessageInputSchema = queueBaseSchema
  .omit({
    deliveryMode: true,
    sendAt: true,
    idempotencyKey: true
  })
  .extend({
    priority: z.enum(communicationPriorityValues).default("normal"),
    idempotencyKey: z.string().min(3).optional()
  })
  .superRefine((input, ctx) => {
    validateNotificationMessageInput(
      {
        ...input,
        deliveryMode: "immediate"
      },
      ctx
    );
  });

export const registerDeliveryEndpointInputSchema = z.object({
  endpointId: z.string().min(2),
  tenantId: z.string().min(2),
  recipientRef: z.string().min(2),
  channel: z.enum(communicationChannelValues),
  label: z.string().min(2),
  destinationKind: z.string().min(2),
  address: z.string().min(2),
  providerRoute: z.string().min(2),
  actorId: z.string().min(2),
  reason: z.string().min(3).optional()
});

export const upsertDeliveryPreferenceInputSchema = z.object({
  preferenceId: z.string().min(2),
  tenantId: z.string().min(2),
  subjectRef: z.string().min(2),
  channel: z.enum(communicationChannelValues),
  enabled: z.boolean(),
  digestEnabled: z.boolean(),
  actorId: z.string().min(2),
  reason: z.string().min(3).optional()
});

export const retryNotificationMessageInputSchema = z.object({
  message: notificationMessageSchema,
  attempts: z.array(notificationMessageAttemptSchema).min(1),
  actorId: z.string().min(2),
  reason: z.string().min(3),
  maxAttempts: z.number().int().positive().default(2)
});

export const cancelNotificationMessageInputSchema = z.object({
  message: notificationMessageSchema,
  actorId: z.string().min(2),
  reason: z.string().min(3)
});

export type NotificationDeliveryEndpoint = z.infer<typeof notificationDeliveryEndpointSchema>;
export type NotificationDeliveryPreference = z.infer<typeof notificationDeliveryPreferenceSchema>;
export type NotificationMessageRecord = z.infer<typeof notificationMessageSchema>;
export type NotificationMessageAttemptRecord = z.infer<typeof notificationMessageAttemptSchema>;
export type QueueNotificationMessageInput = z.infer<typeof queueNotificationMessageInputSchema>;
export type TestSendNotificationMessageInput = z.infer<typeof testSendNotificationMessageInputSchema>;
export type RegisterDeliveryEndpointInput = z.infer<typeof registerDeliveryEndpointInputSchema>;
export type UpsertDeliveryPreferenceInput = z.infer<typeof upsertDeliveryPreferenceInputSchema>;
export type RetryNotificationMessageInput = z.infer<typeof retryNotificationMessageInputSchema>;
export type CancelNotificationMessageInput = z.infer<typeof cancelNotificationMessageInputSchema>;

function validateNotificationMessageInput(
  input: {
    channel: (typeof communicationChannelValues)[number];
    deliveryMode: (typeof communicationDeliveryModeValues)[number];
    sendAt?: string | undefined;
    templateId?: string | undefined;
    bodyText?: string | undefined;
    title?: string | undefined;
  },
  ctx: z.RefinementCtx
): void {
  if (input.deliveryMode === "scheduled" && !input.sendAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "scheduled delivery requires sendAt"
    });
  }

  if (input.channel === "email" && !input.templateId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["templateId"],
      message: "email delivery requires templateId"
    });
  }

  if (input.channel === "sms" && !input.bodyText) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bodyText"],
      message: "sms delivery requires bodyText"
    });
  }

  if ((input.channel === "push" || input.channel === "in-app") && !input.bodyText) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bodyText"],
      message: `${input.channel} delivery requires bodyText`
    });
  }

  if ((input.channel === "push" || input.channel === "in-app") && !input.title) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["title"],
      message: `${input.channel} delivery requires title`
    });
  }
}
