import {
  defineAdminNav,
  defineCommand,
  definePage,
  defineSearchProvider,
  defineWorkspace,
  type AdminContributionRegistry
} from "@platform/admin-contracts";

import {
  CommunicationsAttemptsAdminPage,
  CommunicationsEndpointsAdminPage,
  CommunicationsHealthAdminPage,
  CommunicationsMessagesAdminPage,
  CommunicationsPreferencesAdminPage
} from "./admin/main.page";

export const adminContributions: Pick<
  AdminContributionRegistry,
  "workspaces" | "nav" | "pages" | "commands" | "searchProviders"
> = {
  workspaces: [
    defineWorkspace({
      id: "communications",
      label: "Communications",
      icon: "messages-square",
      description: "Messages, delivery attempts, endpoints, preferences, and provider route health.",
      permission: "notifications.messages.read",
      homePath: "/admin/workspace/communications",
      quickActions: [
        "communications.open.messages",
        "communications.open.endpoints",
        "communications.open.health"
      ]
    })
  ],
  nav: [
    defineAdminNav({
      workspace: "communications",
      group: "operations",
      items: [
        {
          id: "communications.messages",
          label: "Messages",
          icon: "mail",
          to: "/admin/communications/messages",
          permission: "notifications.messages.read"
        },
        {
          id: "communications.attempts",
          label: "Attempts",
          icon: "activity",
          to: "/admin/communications/attempts",
          permission: "notifications.messages.read"
        },
        {
          id: "communications.endpoints",
          label: "Endpoints",
          icon: "waypoints",
          to: "/admin/communications/endpoints",
          permission: "notifications.delivery-endpoints.read"
        },
        {
          id: "communications.preferences",
          label: "Preferences",
          icon: "sliders-horizontal",
          to: "/admin/communications/preferences",
          permission: "notifications.delivery-preferences.read"
        },
        {
          id: "communications.health",
          label: "Health",
          icon: "shield-check",
          to: "/admin/communications/health",
          permission: "notifications.messages.read"
        }
      ]
    })
  ],
  pages: [
    definePage({
      id: "communications.messages.page",
      kind: "list",
      route: "/admin/communications/messages",
      label: "Messages",
      workspace: "communications",
      group: "operations",
      permission: "notifications.messages.read",
      component: CommunicationsMessagesAdminPage
    }),
    definePage({
      id: "communications.attempts.page",
      kind: "list",
      route: "/admin/communications/attempts",
      label: "Attempts",
      workspace: "communications",
      group: "operations",
      permission: "notifications.messages.read",
      component: CommunicationsAttemptsAdminPage
    }),
    definePage({
      id: "communications.endpoints.page",
      kind: "list",
      route: "/admin/communications/endpoints",
      label: "Endpoints",
      workspace: "communications",
      group: "operations",
      permission: "notifications.delivery-endpoints.read",
      component: CommunicationsEndpointsAdminPage
    }),
    definePage({
      id: "communications.preferences.page",
      kind: "list",
      route: "/admin/communications/preferences",
      label: "Preferences",
      workspace: "communications",
      group: "operations",
      permission: "notifications.delivery-preferences.read",
      component: CommunicationsPreferencesAdminPage
    }),
    definePage({
      id: "communications.health.page",
      kind: "detail",
      route: "/admin/communications/health",
      label: "Health",
      workspace: "communications",
      group: "operations",
      permission: "notifications.messages.read",
      component: CommunicationsHealthAdminPage
    })
  ],
  commands: [
    defineCommand({
      id: "communications.open.messages",
      label: "Open Communications Messages",
      permission: "notifications.messages.read",
      href: "/admin/communications/messages",
      keywords: ["communications", "messages", "notifications", "email", "sms", "push"]
    }),
    defineCommand({
      id: "communications.open.endpoints",
      label: "Open Communication Endpoints",
      permission: "notifications.delivery-endpoints.read",
      href: "/admin/communications/endpoints",
      keywords: ["communications", "endpoints", "addresses", "tokens"]
    }),
    defineCommand({
      id: "communications.open.health",
      label: "Open Communication Health",
      permission: "notifications.messages.read",
      href: "/admin/communications/health",
      keywords: ["communications", "health", "providers", "routes"]
    })
  ],
  searchProviders: [
    defineSearchProvider({
      id: "communications.search",
      scopes: ["messages", "attempts", "endpoints", "preferences", "health"],
      permission: "notifications.messages.read",
      search(query) {
        const items = [
          {
            id: "communications-search:messages",
            label: "Communication Messages",
            href: "/admin/communications/messages",
            kind: "page" as const,
            description: "Canonical outbound messages across email, sms, push, and in-app channels."
          },
          {
            id: "communications-search:attempts",
            label: "Communication Attempts",
            href: "/admin/communications/attempts",
            kind: "page" as const,
            description: "Provider attempt telemetry, retries, and callback outcomes."
          },
          {
            id: "communications-search:endpoints",
            label: "Communication Endpoints",
            href: "/admin/communications/endpoints",
            kind: "page" as const,
            description: "Governed email addresses, phone numbers, push tokens, and other delivery destinations."
          }
        ];

        return items.filter((item) =>
          `${item.label} ${item.description}`.toLowerCase().includes(query.toLowerCase())
        );
      }
    })
  ]
};
