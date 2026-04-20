import { defineResource } from "@platform/schema";

import {
  deliveryEndpoints,
  deliveryPreferences,
  messageAttempts,
  messages
} from "../../db/schema";
import {
  notificationDeliveryEndpointSchema,
  notificationDeliveryPreferenceSchema,
  notificationMessageAttemptSchema,
  notificationMessageSchema
} from "../model";

export const NotificationDeliveryEndpointResource = defineResource({
  id: "notifications.delivery-endpoints",
  description: "Canonical delivery endpoints for email addresses, phone numbers, push tokens, and other direct destinations.",
  businessPurpose: "Keep operator-reviewed delivery addresses separate from message records while preserving immutable snapshots on sends.",
  table: deliveryEndpoints,
  contract: notificationDeliveryEndpointSchema,
  fields: {
    recipientRef: { searchable: true, sortable: true, label: "Recipient" },
    channel: { filter: "select", label: "Channel" },
    label: { searchable: true, sortable: true, label: "Label" },
    destinationKind: { filter: "select", label: "Destination" },
    address: { searchable: true, sortable: true, label: "Address" },
    providerRoute: { searchable: true, sortable: true, label: "Route" },
    status: { filter: "select", label: "Status" },
    updatedAt: { sortable: true, label: "Updated" }
  },
  admin: {
    autoCrud: true,
    defaultColumns: ["channel", "label", "address", "providerRoute", "status", "updatedAt"]
  },
  portal: {
    enabled: false
  }
});

export const NotificationDeliveryPreferenceResource = defineResource({
  id: "notifications.delivery-preferences",
  description: "Per-subject suppression and digest preferences for communication delivery channels.",
  businessPurpose: "Allow operators and products to honor opt-outs before any provider dispatch is attempted.",
  table: deliveryPreferences,
  contract: notificationDeliveryPreferenceSchema,
  fields: {
    subjectRef: { searchable: true, sortable: true, label: "Subject" },
    channel: { filter: "select", label: "Channel" },
    enabled: { filter: "select", label: "Enabled" },
    digestEnabled: { filter: "select", label: "Digest" },
    updatedAt: { sortable: true, label: "Updated" }
  },
  admin: {
    autoCrud: true,
    defaultColumns: ["subjectRef", "channel", "enabled", "digestEnabled", "updatedAt"]
  },
  portal: {
    enabled: false
  }
});

export const NotificationMessageResource = defineResource({
  id: "notifications.messages",
  description: "Queued, scheduled, delivered, failed, and cancelled communication records across all outbound channels.",
  businessPurpose: "Provide the single source of truth for communication lifecycle state, destination snapshots, and provider correlation.",
  table: messages,
  contract: notificationMessageSchema,
  fields: {
    channel: { filter: "select", label: "Channel" },
    recipientRef: { searchable: true, sortable: true, label: "Recipient" },
    templateId: { searchable: true, sortable: true, label: "Template" },
    deliveryMode: { filter: "select", label: "Delivery" },
    priority: { filter: "select", label: "Priority" },
    providerRoute: { searchable: true, sortable: true, label: "Route" },
    status: { filter: "select", label: "Status" },
    sendAt: { sortable: true, label: "Send At" },
    createdAt: { sortable: true, label: "Created" }
  },
  admin: {
    autoCrud: true,
    defaultColumns: ["channel", "recipientRef", "deliveryMode", "priority", "providerRoute", "status", "createdAt"]
  },
  portal: {
    enabled: false
  }
});

export const NotificationMessageAttemptResource = defineResource({
  id: "notifications.message-attempts",
  description: "Auditable attempt history for each provider dispatch, callback reconciliation, retry, or suppression decision.",
  businessPurpose: "Expose delivery reliability and recovery paths without hiding transient provider failures or operator actions.",
  table: messageAttempts,
  contract: notificationMessageAttemptSchema,
  fields: {
    messageId: { searchable: true, sortable: true, label: "Message" },
    attemptNumber: { sortable: true, label: "Attempt" },
    providerRoute: { searchable: true, sortable: true, label: "Route" },
    status: { filter: "select", label: "Status" },
    outcomeCategory: { filter: "select", label: "Outcome" },
    occurredAt: { sortable: true, label: "Occurred" }
  },
  admin: {
    autoCrud: true,
    defaultColumns: ["messageId", "attemptNumber", "providerRoute", "status", "outcomeCategory", "occurredAt"]
  },
  portal: {
    enabled: false
  }
});

export const notificationResources = [
  NotificationDeliveryEndpointResource,
  NotificationDeliveryPreferenceResource,
  NotificationMessageResource,
  NotificationMessageAttemptResource
] as const;
