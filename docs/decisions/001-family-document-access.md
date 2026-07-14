# ADR 001: Private and family document access

- Status: Accepted
- Date: 2026-07-14

## Context

Papervard is intended for a family, while each person still needs a genuinely private area. A separate physical database per person would complicate search, backups, migrations and family sharing without improving the application-level privacy model.

## Decision

Papervard uses one PostgreSQL database and an explicit household access model:

- Every document has one `ownerUserId`, one `householdId` and a `visibility` of `private` or `family`.
- The owner can always access the document.
- A family document is accessible to active members of the same household.
- A private document is accessible only to its owner. Application and family admins receive no implicit read access.
- All list, search, detail, thumbnail, inline-file, download and bulk-download paths enforce the same rule on the server.
- Favorites remain personal to each user.
- New uploads default to private. The owner can later change the visibility.
- Existing documents are migrated to family visibility to preserve the previous shared-library behaviour.
- Users created by an administrator automatically join the default family.

## Consequences

The model supports private and shared documents without duplicating databases. Search queries must always include the current user and household memberships. Administrative maintenance actions can operate only on the administrator's own or family-shared documents. Database backups still contain all households and therefore need infrastructure-level encryption and access control.

## Rejected alternative

A physical database per user was rejected because cross-family search and sharing would require duplication or federation, migrations would need to run for every database, and backup/restore operations would be harder for the target audience.
