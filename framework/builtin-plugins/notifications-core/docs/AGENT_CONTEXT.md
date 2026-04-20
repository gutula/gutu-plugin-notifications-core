# Notifications Core Agent Context

Package/app id: `notifications-core`
Target type: `package`  | Package kind: `app`
Location: `framework/builtin-plugins/notifications-core`

## Purpose

Outbound and in-app notifications.

## System role

Describe how this target fits into the larger product, which teams depend on it, and which business outcomes it is responsible for.

## Declared dependencies

- audit-core
- auth-core
- org-tenant-core
- role-policy-core

## Provided capabilities

- notifications.messages

## Requested capabilities

- api.rest.mount
- data.write.notifications
- ui.register.admin

## Core resources

### `notifications.messages`

_Add a concise description for why this resource exists._

Business purpose: _Document the operational purpose of this resource._

Key fields:
- `channel` (Channel) | Add a field description so agents understand what this value means.
- `createdAt` (Created) | Add a field description so agents understand what this value means.
- `deliveryMode` (Delivery) | Add a field description so agents understand what this value means.
- `id` (Id) | Add a field description so agents understand what this value means.
- `priority` (Priority) | Add a field description so agents understand what this value means.
- `providerRoute` (Provider) | Add a field description so agents understand what this value means.
- `recipientRef` (Recipient Ref) | Add a field description so agents understand what this value means.
- `sendAt` (Send At) | Add a field description so agents understand what this value means.
- `status` (Status) | Add a field description so agents understand what this value means.
- `templateKey` (Template) | Add a field description so agents understand what this value means.
- `tenantId` (Tenant Id) | Add a field description so agents understand what this value means.

## Core actions

### `notifications.messages.queue`

_Document what this action does in business terms._

Permission: `notifications.messages.queue`

Business purpose: _Explain why operators or automation invoke this action._

Preconditions:
- _Document the checks that must pass before this action runs._

Side effects:
- _Document emitted events, writes, notifications, and follow-up jobs._

Forbidden shortcuts:
- _Document any paths agents must never bypass._

## Core workflows

_No workflows were discovered for this target._