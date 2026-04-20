import { definePolicy } from "@platform/permissions";

export const notificationsPolicy = definePolicy({
  id: "notifications-core.default",
  rules: [
    {
      permission: "notifications.messages.read",
      allowIf: ["role:admin", "role:operator"]
    },
    {
      permission: "notifications.delivery-endpoints.read",
      allowIf: ["role:admin", "role:operator"]
    },
    {
      permission: "notifications.delivery-preferences.read",
      allowIf: ["role:admin", "role:operator"]
    },
    {
      permission: "notifications.messages.queue",
      allowIf: ["role:admin"],
      requireReason: true,
      audit: true
    },
    {
      permission: "notifications.delivery-endpoints.register",
      allowIf: ["role:admin", "role:operator"],
      audit: true
    },
    {
      permission: "notifications.delivery-preferences.upsert",
      allowIf: ["role:admin", "role:operator"],
      audit: true
    },
    {
      permission: "notifications.messages.retry",
      allowIf: ["role:admin", "role:operator"],
      requireReason: true,
      audit: true
    },
    {
      permission: "notifications.messages.cancel",
      allowIf: ["role:admin", "role:operator"],
      requireReason: true,
      audit: true
    },
    {
      permission: "notifications.messages.test-send",
      allowIf: ["role:admin", "role:operator"],
      audit: true
    }
  ]
});
