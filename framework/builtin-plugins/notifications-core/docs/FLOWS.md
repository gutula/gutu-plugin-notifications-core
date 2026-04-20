# Notifications Core Flows

## Happy paths

- `notifications.delivery-endpoints.register`: Register a governed delivery endpoint that can be reused across outbound messages.
- `notifications.delivery-preferences.upsert`: Store channel-level enablement and digest preferences for a subject.
- `notifications.messages.queue`: Queue, schedule, or suppress a notification message before provider dispatch.
- `notifications.messages.retry`: Retry a previously failed notification message when the failure mode is recoverable.
- `notifications.messages.cancel`: Cancel a queued or scheduled message before it is delivered.
- `notifications.messages.test-send`: Send a one-off test message through the deterministic local provider path.

## Action-level flows

### `notifications.delivery-endpoints.register`

Register a governed delivery endpoint that can be reused across outbound messages.

Permission: `notifications.delivery-endpoints.register`

Business purpose: Persist reviewed delivery destinations separately from message records while preserving immutable message snapshots.

Preconditions:

- Caller input must satisfy the action schema exported by the plugin.
- The caller must satisfy the declared permission and any host-level installation constraints.
- Integration should honor the action’s idempotent semantics.

Side effects:

- Mutates or validates state owned by `notifications.delivery-endpoints`, `notifications.delivery-preferences`, `notifications.messages`, `notifications.message-attempts`.
- May return lifecycle event envelopes to the host runtime.
- May schedule or describe follow-up background work.

Forbidden shortcuts:

- Do not bypass the action contract with undocumented service mutations in application code.
- Do not document extra hooks, retries, or lifecycle semantics unless they are explicitly exported here.


### `notifications.delivery-preferences.upsert`

Store channel-level enablement and digest preferences for a subject.

Permission: `notifications.delivery-preferences.upsert`

Business purpose: Allow operators and products to suppress or aggregate communications before any provider dispatch happens.

Preconditions:

- Caller input must satisfy the action schema exported by the plugin.
- The caller must satisfy the declared permission and any host-level installation constraints.
- Integration should honor the action’s idempotent semantics.

Side effects:

- Mutates or validates state owned by `notifications.delivery-endpoints`, `notifications.delivery-preferences`, `notifications.messages`, `notifications.message-attempts`.
- May return lifecycle event envelopes to the host runtime.
- May schedule or describe follow-up background work.

Forbidden shortcuts:

- Do not bypass the action contract with undocumented service mutations in application code.
- Do not document extra hooks, retries, or lifecycle semantics unless they are explicitly exported here.


### `notifications.messages.queue`

Queue, schedule, or suppress a notification message before provider dispatch.

Permission: `notifications.messages.queue`

Business purpose: Create the canonical communication record with lifecycle state, jobs, and audit events.

Preconditions:

- Caller input must satisfy the action schema exported by the plugin.
- The caller must satisfy the declared permission and any host-level installation constraints.
- Integration should honor the action’s idempotent semantics.

Side effects:

- Mutates or validates state owned by `notifications.delivery-endpoints`, `notifications.delivery-preferences`, `notifications.messages`, `notifications.message-attempts`.
- May return lifecycle event envelopes to the host runtime.
- May schedule or describe follow-up background work.

Forbidden shortcuts:

- Do not bypass the action contract with undocumented service mutations in application code.
- Do not document extra hooks, retries, or lifecycle semantics unless they are explicitly exported here.


### `notifications.messages.retry`

Retry a previously failed notification message when the failure mode is recoverable.

Permission: `notifications.messages.retry`

Business purpose: Allow operator or workflow retries without hiding transient provider failures or violating max-attempt policy.

Preconditions:

- Caller input must satisfy the action schema exported by the plugin.
- The caller must satisfy the declared permission and any host-level installation constraints.
- Integration should honor the action’s idempotent semantics.

Side effects:

- Mutates or validates state owned by `notifications.delivery-endpoints`, `notifications.delivery-preferences`, `notifications.messages`, `notifications.message-attempts`.
- May return lifecycle event envelopes to the host runtime.
- May schedule or describe follow-up background work.

Forbidden shortcuts:

- Do not bypass the action contract with undocumented service mutations in application code.
- Do not document extra hooks, retries, or lifecycle semantics unless they are explicitly exported here.


### `notifications.messages.cancel`

Cancel a queued or scheduled message before it is delivered.

Permission: `notifications.messages.cancel`

Business purpose: Stop outbound delivery while preserving an auditable message record and operator context.

Preconditions:

- Caller input must satisfy the action schema exported by the plugin.
- The caller must satisfy the declared permission and any host-level installation constraints.
- Integration should honor the action’s idempotent semantics.

Side effects:

- Mutates or validates state owned by `notifications.delivery-endpoints`, `notifications.delivery-preferences`, `notifications.messages`, `notifications.message-attempts`.
- May return lifecycle event envelopes to the host runtime.
- May schedule or describe follow-up background work.

Forbidden shortcuts:

- Do not bypass the action contract with undocumented service mutations in application code.
- Do not document extra hooks, retries, or lifecycle semantics unless they are explicitly exported here.


### `notifications.messages.test-send`

Send a one-off test message through the deterministic local provider path.

Permission: `notifications.messages.test-send`

Business purpose: Exercise communication compilation and provider dispatch without needing live third-party credentials.

Preconditions:

- Caller input must satisfy the action schema exported by the plugin.
- The caller must satisfy the declared permission and any host-level installation constraints.
- Integration should honor the action’s idempotent semantics.

Side effects:

- Mutates or validates state owned by `notifications.delivery-endpoints`, `notifications.delivery-preferences`, `notifications.messages`, `notifications.message-attempts`.
- May return lifecycle event envelopes to the host runtime.
- May schedule or describe follow-up background work.

Forbidden shortcuts:

- Do not bypass the action contract with undocumented service mutations in application code.
- Do not document extra hooks, retries, or lifecycle semantics unless they are explicitly exported here.


## Cross-package interactions

- Direct dependencies: `auth-core`, `org-tenant-core`, `role-policy-core`, `audit-core`
- Requested capabilities: `ui.register.admin`, `api.rest.mount`, `data.write.notifications`, `jobs.dispatch.notifications`, `events.publish.notifications`
- Integration model: Actions+Resources+Events+Jobs+UI
- Recovery ownership should stay with the host orchestration layer when the plugin does not explicitly export jobs, workflows, or lifecycle events.
