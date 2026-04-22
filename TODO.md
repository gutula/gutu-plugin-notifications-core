# Notifications Core TODO

**Maturity Tier:** `Production Candidate`

## Shipped Now

- Exports 6 governed actions: `notifications.delivery-endpoints.register`, `notifications.delivery-preferences.upsert`, `notifications.messages.queue`, `notifications.messages.retry`, `notifications.messages.cancel`, `notifications.messages.test-send`.
- Owns 4 resource contracts: `notifications.delivery-endpoints`, `notifications.delivery-preferences`, `notifications.messages`, `notifications.message-attempts`.
- Adds richer admin workspace contributions on top of the base UI surface.
- Ships explicit SQL migration or rollback helpers alongside the domain model.
- Service results already expose lifecycle events and follow-up jobs for orchestration-aware hosts, including the first-party AI approval, escalation, and company-intake follow-up flows added in this rollout.

## Current Gaps

- No additional gaps were identified beyond the plugin’s stated non-goals.

## Recommended Next

- Add live provider connectors and stronger long-running delivery reconciliation once the current local-provider contract is stable.
- Promote the current lifecycle events and dispatch flow into richer platform orchestration surfaces where downstream plugins need them.
- Broaden lifecycle coverage with deeper orchestration, reconciliation, and operator tooling where the business flow requires it.
- Add more explicit domain events or follow-up job surfaces when downstream systems need tighter coupling.

## Later / Optional

- Campaign tooling, inbound processing, and broader provider governance after the transactional substrate has matured.
- Outbound connectors, richer analytics, or portal-facing experiences once the core domain contracts harden.
