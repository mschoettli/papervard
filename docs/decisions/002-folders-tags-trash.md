# ADR-002: Relational folders, manual tags and recoverable deletion

## Status

Accepted

## Date

2026-07-14

## Context

Papervard currently presents every accessible PDF in one flat document hub. Users need a durable filing system that preserves the existing private/family boundary while adding nested folders, recursive folder search, drag-and-drop, manual tags and recoverable deletion.

The agreed product rules are:

- Folders may be nested to any depth.
- A folder is private to its creator or shared with the creator's family. Every family member may manage shared folders.
- Each private owner and each family has one immutable root folder named `Unsortiert`.
- Every document always belongs to a folder. Uploads without an explicit destination go to the matching `Unsortiert` folder.
- Deleting a non-empty folder moves its direct documents and child folders to the matching `Unsortiert` folder before placing the now-empty folder in the trash.
- Documents and folders remain in the trash for 30 days, can be restored, and are permanently removed afterwards. If their former parent no longer exists, restoration targets `Unsortiert`.
- Tags are manual, family-scoped metadata. Authorized users can create, rename, recolor, merge and delete tags, and assign multiple tags to documents.
- AI tagging and external AI APIs are explicitly out of scope.

## Decision

Use relational adjacency lists for folders and explicit many-to-many relations for tags.

- `Folder.parentId` represents nesting. Application-level validation prevents cycles and cross-visibility moves.
- `Document.folderId` is required after migration and is kept compatible with the document visibility.
- System `Unsortiert` folders are identified with `isSystem` and created idempotently for every private owner/family scope.
- `deletedAt` and `deletedFromFolderId` retain trash state and the preferred restoration target. Active reads always exclude soft-deleted records.
- `Tag` belongs to a household. `DocumentTag` records assignments and the assigning user.
- Recursive folder search resolves all accessible descendants of the selected folder before executing the existing hybrid document search.
- Server Actions remain the mutation boundary. Every action authenticates, validates runtime input and authorizes the target resource independently of the UI.
- Native HTML drag-and-drop enhances the interface; action menus and forms remain the keyboard/touch fallback.

## Alternatives considered

### Path strings

Storing paths such as `Familie/Versicherung/2026` makes reads simple, but every rename or move rewrites descendants and creates fragile concurrency behavior. Rejected.

### Tags as simulated folders

Using tags for hierarchy avoids a folder table but cannot express a single parent, safe subtree moves, or a stable upload destination. Rejected.

### Immediate deletion

Immediate deletion is simpler but conflicts with the required 30-day recovery window and makes drag-and-drop mistakes costly. Rejected.

### AI-generated tags

OpenAI, Anthropic and local model integrations were explored, then explicitly rejected. Papervard keeps tags fully manual and sends no document content to an AI provider.

## Consequences

- Folder moves and deletes require transactions because several records may change together.
- Visibility changes may require moving a document to another `Unsortiert` folder.
- Queries, downloads, previews and search must consistently exclude trashed documents.
- The 30-day purge is implemented as an idempotent server-side cleanup that can run during normal authenticated document access; deployments may later call the same cleanup from a scheduler.
- Shared tag names are unique per household by normalized application validation.
- Restoring a deleted folder normally returns it to its former parent; a missing or inaccessible parent falls back to `Unsortiert`.
