# Notifications Core Business Rules

## Invariants

- The plugin remains authoritative only for the data declared in `notifications-core` and its owned resource set.
- Integrators must respect the declared permission and idempotency semantics of each exported action.
- Cross-plugin automation must use explicit commands, resources, jobs, or workflows instead of hidden coupling.

## Lifecycle notes

- This plugin currently exports 6 action(s), 4 resource(s), 0 job definition(s), and 0 workflow definition(s).
- Durable data behavior is bounded by the declared schema and compatibility contract: postgres, sqlite.
- Maturity is currently assessed as `Production Candidate`, which means the documentation and operational promises must stay within that boundary.

## Actor expectations

- Host applications own installation, manifest solving, and runtime registration.
- Operators and automation should invoke exported actions or follow the job/workflow catalog instead of mutating state ad hoc.
- Contributors should keep README, DEVELOPER, TODO, and nested docs synchronized whenever the public contract changes.

## Decision boundaries

- Safe retries are only those already supported by the action/job semantics documented in this repo.
- Human or operator review is still expected whenever the exported surface does not provide an explicit automation contract.
- Future roadmap ideas belong in the recommended-next section, not in current-capability claims.
