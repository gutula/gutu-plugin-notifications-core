/** Admin-shell UI contributions for notifications-core.
 *
 *  - /settings/notification-rules — rule editor
 *  - Detail rail: NotificationDeliveriesCard on every record (resource '*')
 *    so any record can show its recent notification deliveries.
 */

import { defineAdminUi } from "@gutu-host/plugin-ui-contract";
import { NotificationRulesPage } from "./pages/NotificationRulesPage";
import { NotificationDeliveriesCard } from "./primitives/NotificationDeliveriesCard";

export const adminUi = defineAdminUi({
  id: "notifications-core",
  pages: [
    {
      id: "notifications-core.rules",
      path: "/settings/notification-rules",
      title: "Notification rules",
      description: "Event-driven notifications with templates + condition trees.",
      Component: NotificationRulesPage,
      icon: "Bell",
    },
  ],
  navEntries: [
    {
      id: "notifications-core.nav.rules",
      label: "Notification rules",
      icon: "Bell",
      path: "/settings/notification-rules",
      section: "settings",
      order: 14,
    },
  ],
  commands: [
    {
      id: "notifications-core.cmd.rules",
      label: "Open Notification rules",
      icon: "Bell",
      keywords: ["notification", "rule", "trigger", "alert", "automation"],
      run: () => { window.location.hash = "/settings/notification-rules"; },
    },
  ],
  detailRails: [
    {
      id: "notifications-core.rail.deliveries",
      resourcePattern: "*",
      Component: NotificationDeliveriesCard,
      priority: 0,
    },
  ],
});

export { NotificationRulesPage } from "./pages/NotificationRulesPage";
export { NotificationDeliveriesCard } from "./primitives/NotificationDeliveriesCard";
