# Notifications Core Glossary

| Term | Meaning |
| --- | --- |
| Notifications Core | Canonical outbound communication control plane with delivery endpoints, preferences, attempts, and local provider routes. |
| notifications.messages | Capability published by this plugin manifest. |
| notifications.message-attempts | Capability published by this plugin manifest. |
| notifications.delivery-endpoints | Capability published by this plugin manifest. |
| notifications.delivery-preferences | Capability published by this plugin manifest. |
| notifications.delivery-endpoints.register | Register a governed delivery endpoint that can be reused across outbound messages. |
| notifications.delivery-preferences.upsert | Store channel-level enablement and digest preferences for a subject. |
| notifications.messages.queue | Queue, schedule, or suppress a notification message before provider dispatch. |
| notifications.messages.retry | Retry a previously failed notification message when the failure mode is recoverable. |
| notifications.messages.cancel | Cancel a queued or scheduled message before it is delivered. |
| notifications.messages.test-send | Send a one-off test message through the deterministic local provider path. |
| Message queueing | Primary focus area for Notifications Core. |
| Delivery attempts | Primary focus area for Notifications Core. |
| Endpoint and preference governance | Primary focus area for Notifications Core. |
