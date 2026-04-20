# Notifications Core Mandatory Steps

## Before shipping a change

1. Update the public contract docs in `README.md` and `DEVELOPER.md`.
2. Keep the nested docs under `framework/builtin-plugins/notifications-core/docs` synchronized with the same truth.
3. Run the repo-local verification commands:
   - `bun run build`
   - `bun run typecheck`
   - `bun run lint`
   - `bun run test`
   - `bun run docs:check`
4. Run any extra lanes present for this plugin: `test:unit`, `test:contracts`.
5. Re-check that the plugin is still described through explicit command/resource/job/workflow contracts and not through undocumented hooks.

## Before integrating from another plugin

1. Depend on the manifest ID `notifications-core` and the package import `@plugins/notifications-core`.
2. Use exported actions and resources first.
3. Treat jobs, workflows, and lifecycle envelopes as explicit contracts only when they are actually exported here.
4. Preserve the current non-goal boundary instead of building cross-plugin shortcuts that the repo does not advertise.
