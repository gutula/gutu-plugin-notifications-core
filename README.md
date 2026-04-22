# Notifications Core

<p align="center">
  <img src="./docs/assets/gutu-mascot.png" alt="Gutu mascot" width="220" />
</p>

Canonical outbound communication control plane with delivery endpoints, preferences, attempts, and local provider routes.

![Maturity: Production Candidate](https://img.shields.io/badge/Maturity-Production%20Candidate-0f766e) ![Verification: Build+Typecheck+Lint+Test+Contracts+Migrations+Integration](https://img.shields.io/badge/Verification-Build%2BTypecheck%2BLint%2BTest%2BContracts%2BMigrations%2BIntegration-2563eb) ![DB: postgres+sqlite](https://img.shields.io/badge/DB-postgres%2Bsqlite-2563eb) ![Integration Model: Actions+Resources+Events+Jobs+UI](https://img.shields.io/badge/Integration%20Model-Actions%2BResources%2BEvents%2BJobs%2BUI-0f766e)

## Part Of The Gutu Stack

| Aspect | Value |
| --- | --- |
| Repo kind | First-party plugin |
| Domain group | Operational Data |
| Primary focus | message queueing, delivery attempts, endpoint and preference governance |
| Best when | You need a governed domain boundary with explicit contracts and independent release cadence. |
| Composes through | Actions+Resources+Events+Jobs+UI |

- Gutu keeps plugins as independent repos with manifest-governed boundaries, compatibility channels, and verification lanes instead of hiding everything behind one giant mutable codebase.
- This plugin is meant to compose through explicit actions, resources, jobs, workflows, and runtime envelopes, not through undocumented hook chains.

## What It Does Now

Operates as the outbound communication control plane for deterministic local delivery, endpoint governance, preference management, and auditable attempt history.

- Exports 6 governed actions: `notifications.delivery-endpoints.register`, `notifications.delivery-preferences.upsert`, `notifications.messages.queue`, `notifications.messages.retry`, `notifications.messages.cancel`, `notifications.messages.test-send`.
- Owns 4 resource contracts: `notifications.delivery-endpoints`, `notifications.delivery-preferences`, `notifications.messages`, `notifications.message-attempts`.
- Adds richer admin workspace contributions on top of the base UI surface.
- Ships explicit SQL migration or rollback helpers alongside the domain model.
- Service results already expose lifecycle events and follow-up jobs for orchestration-aware hosts, including the first-party AI approval, escalation, and company-intake follow-up flows added in this rollout.

## Maturity

**Maturity Tier:** `Production Candidate`

This tier is justified because unit coverage exists, contract coverage exists, integration coverage exists, migration coverage exists, and service results already carry orchestration signals.

## Verified Capability Summary

- Group: **Operational Data**
- Verification surface: **Build+Typecheck+Lint+Test+Contracts+Migrations+Integration**
- Tests discovered: **4** total files across unit, contract, integration, migration lanes
- Integration model: **Actions+Resources+Events+Jobs+UI**
- Database support: **postgres + sqlite**

## Dependency And Compatibility Summary

| Field | Value |
| --- | --- |
| Package | `@plugins/notifications-core` |
| Manifest ID | `notifications-core` |
| Repo | [gutu-plugin-notifications-core](https://github.com/gutula/gutu-plugin-notifications-core) |
| Depends On | `auth-core`, `org-tenant-core`, `role-policy-core`, `audit-core` |
| Requested Capabilities | `ui.register.admin`, `api.rest.mount`, `data.write.notifications`, `jobs.dispatch.notifications`, `events.publish.notifications` |
| Provided Capabilities | `notifications.messages`, `notifications.message-attempts`, `notifications.delivery-endpoints`, `notifications.delivery-preferences` |
| Runtime | bun>=1.3.12 |
| Database | postgres, sqlite |
| Integration Model | Actions+Resources+Events+Jobs+UI |

## Capability Matrix

| Surface | Count | Details |
| --- | --- | --- |
| Actions | 6 | `notifications.delivery-endpoints.register`, `notifications.delivery-preferences.upsert`, `notifications.messages.queue`, `notifications.messages.retry`, `notifications.messages.cancel`, `notifications.messages.test-send` |
| Resources | 4 | `notifications.delivery-endpoints`, `notifications.delivery-preferences`, `notifications.messages`, `notifications.message-attempts` |
| Jobs | 0 | No job catalog exported |
| Workflows | 0 | No workflow catalog exported |
| UI | Present | base UI surface, admin contributions |

## Quick Start For Integrators

Use this repo inside a **compatible Gutu workspace** or the **ecosystem certification workspace** so its `workspace:*` dependencies resolve honestly.

```bash
# from a compatible workspace that already includes this plugin's dependency graph
bun install
bun run build
bun run test
bun run docs:check
```

```ts
import { manifest, registerDeliveryEndpointAction, NotificationDeliveryEndpointResource, adminContributions, uiSurface } from "@plugins/notifications-core";

console.log(manifest.id);
console.log(registerDeliveryEndpointAction.id);
console.log(NotificationDeliveryEndpointResource.id);
```

Use the root repo scripts for day-to-day work **after the workspace is bootstrapped**, or run the nested package directly from `framework/builtin-plugins/notifications-core` if you need lower-level control.

## Current Test Coverage

- Root verification scripts: `bun run build`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:contracts`, `bun run test:unit`, `bun run test:integration`, `bun run test:migrations`, `bun run docs:check`
- Unit files: 1
- Contracts files: 1
- Integration files: 1
- Migrations files: 1

## Known Boundaries And Non-Goals

- Not a full vertical application suite; this plugin only owns the domain slice exported in this repo.
- Not a replacement for explicit orchestration in jobs/workflows when multi-step automation is required.
- Does not currently ship live third-party connector packages in this repo.
- Does not export inbound email/SMS handling, campaigns, or marketing-automation workflows.
- Cross-plugin composition should use Gutu command, event, job, and workflow primitives. This repo should not be documented as exposing a generic WordPress-style hook system unless one is explicitly exported.

## Recommended Next Milestones

- Add live provider connectors and stronger long-running delivery reconciliation once the current local-provider contract is stable.
- Promote the current lifecycle events and dispatch flow into richer platform orchestration surfaces where downstream plugins need them.
- Broaden lifecycle coverage with deeper orchestration, reconciliation, and operator tooling where the business flow requires it.
- Add more explicit domain events or follow-up job surfaces when downstream systems need tighter coupling.

## More Docs

See [DEVELOPER.md](./DEVELOPER.md), [TODO.md](./TODO.md), [SECURITY.md](./SECURITY.md), [CONTRIBUTING.md](./CONTRIBUTING.md). The internal domain sources used to build those docs live under:

- `plugins/gutu-plugin-notifications-core/framework/builtin-plugins/notifications-core/docs/AGENT_CONTEXT.md`
- `plugins/gutu-plugin-notifications-core/framework/builtin-plugins/notifications-core/docs/BUSINESS_RULES.md`
- `plugins/gutu-plugin-notifications-core/framework/builtin-plugins/notifications-core/docs/EDGE_CASES.md`
- `plugins/gutu-plugin-notifications-core/framework/builtin-plugins/notifications-core/docs/FLOWS.md`
- `plugins/gutu-plugin-notifications-core/framework/builtin-plugins/notifications-core/docs/GLOSSARY.md`
- `plugins/gutu-plugin-notifications-core/framework/builtin-plugins/notifications-core/docs/MANDATORY_STEPS.md`
