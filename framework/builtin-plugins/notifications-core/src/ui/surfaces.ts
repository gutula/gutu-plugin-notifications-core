import { defineUiSurface } from "@platform/ui-shell";
import { NotificationsCoreAdminPage } from "./admin/main.page";

export const uiSurface = defineUiSurface({
  embeddedPages: [
    {
      shell: "admin",
      route: "/admin/notifications-core",
      component: NotificationsCoreAdminPage,
      permission: "notifications.messages.read"
    }
  ],
  widgets: []
});
