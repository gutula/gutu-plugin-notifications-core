import { definePackage } from "@platform/kernel";

export default definePackage({
  id: "notifications-core",
  kind: "app",
  version: "0.1.0",
  displayName: "Notifications Core",
  defaultCategory: {
    id: "business",
    label: "Business",
    subcategoryId: "communications",
    subcategoryLabel: "Communications"
  },
  description: "Canonical outbound communication control plane with delivery endpoints, preferences, attempts, and local provider routes.",
  extends: [],
  dependsOn: ["auth-core","org-tenant-core","role-policy-core","audit-core"],
  optionalWith: [],
  conflictsWith: [],
  providesCapabilities: [
    "notifications.messages",
    "notifications.message-attempts",
    "notifications.delivery-endpoints",
    "notifications.delivery-preferences"
  ],
  requestedCapabilities: [
    "ui.register.admin",
    "api.rest.mount",
    "data.write.notifications",
    "jobs.dispatch.notifications",
    "events.publish.notifications"
  ],
  ownsData: [
    "notifications.messages",
    "notifications.message-attempts",
    "notifications.delivery-endpoints",
    "notifications.delivery-preferences"
  ],
  extendsData: [],
  slotClaims: [],
  trustTier: "first-party",
  reviewTier: "R1",
  isolationProfile: "same-process-trusted",
  compatibility: {
    framework: "^0.1.0",
    runtime: "bun>=1.3.12",
    db: ["postgres", "sqlite"]
  }
});
