import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const deliveryEndpoints = pgTable("notifications_delivery_endpoints", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  recipientRef: text("recipient_ref").notNull(),
  channel: text("channel").notNull(),
  label: text("label").notNull(),
  destinationKind: text("destination_kind").notNull(),
  address: text("address").notNull(),
  providerRoute: text("provider_route").notNull(),
  status: text("status").notNull(),
  actorId: text("actor_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const deliveryPreferences = pgTable("notifications_delivery_preferences", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  subjectRef: text("subject_ref").notNull(),
  channel: text("channel").notNull(),
  enabled: boolean("enabled").notNull(),
  digestEnabled: boolean("digest_enabled").notNull(),
  actorId: text("actor_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const messages = pgTable("notifications_messages", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  actorId: text("actor_id").notNull(),
  channel: text("channel").notNull(),
  recipientRef: text("recipient_ref").notNull(),
  endpointId: text("endpoint_id"),
  templateId: text("template_id"),
  templateProps: jsonb("template_props"),
  directAddress: text("direct_address"),
  title: text("title"),
  bodyText: text("body_text"),
  data: jsonb("data"),
  deliveryMode: text("delivery_mode").notNull(),
  priority: text("priority").notNull(),
  providerRoute: text("provider_route").notNull(),
  destinationSnapshot: jsonb("destination_snapshot"),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull(),
  sendAt: timestamp("send_at"),
  reason: text("reason"),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  providerMessageId: text("provider_message_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const messageAttempts = pgTable("notifications_message_attempts", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  providerRoute: text("provider_route").notNull(),
  status: text("status").notNull(),
  outcomeCategory: text("outcome_category").notNull(),
  providerMessageId: text("provider_message_id"),
  callbackToken: text("callback_token"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
