# ADR-004: Separate folder and document views

## Status

Accepted for implementation

## Date

2026-08-01

## Context

The current document hub shows global search, folder navigation, folder cards,
scope filters, document filters, uploads and document cards on the same page.
The duplicated folder navigation and competing actions make routine filing and
retrieval unnecessarily dense.

Papervard must remain efficient when a folder contains many similar files, such
as one hundred health-insurance benefit statements. Folder management and
document work therefore need distinct information hierarchies.

## Understanding summary

- A dedicated folder page shows only folders and folder-management actions.
- A dedicated document page shows only documents and document-related actions.
- Opening a folder shows its documents on the document page.
- The selected folder includes documents from all accessible descendants.
- Every document card identifies the relative folder path it comes from.
- Preview cards remain the default document presentation.
- Submitting a search replaces the normal view with search results only.

## Assumptions and constraints

- Existing private and family access rules remain unchanged.
- Existing folder, tag, upload, drag-and-drop and trash actions remain available.
- Document results remain server-paginated, initially with 24 items per page.
- Search from either page navigates to the document page in search mode.
- The route split itself needs no framework change. Persistent manual folder
  ordering requires one small database migration.
- OCR, automatic classification and new extracted metadata are out of scope.
- Native controls and action menus remain the keyboard and touch alternative to
  drag-and-drop.

## Decision

### Routes and navigation

Use two first-class routes:

- `/folders` for browsing and managing the folder hierarchy.
- `/documents` for browsing, filtering, searching and uploading documents.

The application navigation exposes separate **Ordner** and **Dokumente**
destinations. A folder selection links to `/documents?folder=<id>`.

### Folder page

The folder page is a single, focused browser without a parallel sidebar.

- The page header contains the title, accessible-folder count, global search,
  **Neuer Ordner**, and a compact menu for secondary management actions.
- A breadcrumb identifies the current folder level.
- The main grid shows only direct child folders of the current level.
- Folder cards show name, total document count, child-folder count, visibility
  and an action menu.
- Folder cards expose a dedicated drag handle. Dropping between cards changes
  their persistent sibling order; dropping on the center of a card moves the
  dragged folder into that target folder.
- Clicking a folder with children navigates one level deeper.
- A **Dokumente anzeigen** action opens the filtered document page.
- A folder without children may open its documents directly.
- System folders omit actions that are not permitted.
- System folders such as `Unsortiert` remain fixed at the beginning and cannot
  be moved or manually reordered.
- The grid uses one column on mobile, two on tablet and at most three on large
  screens.

### Persistent folder ordering

Add a folder position field that is scoped to the folder's current parent. All
folder reads order first by immutable system-folder precedence and then by the
stored position.

Reordering and moving use one authorized server-side mutation boundary. The
operation validates access, visibility compatibility and cycle prevention, then
updates affected sibling positions atomically. A folder moved to another parent
is appended to the end of the target level unless an explicit insertion target
is supplied.

The drag UI distinguishes the operation before drop:

- an insertion marker between cards means reorder at that position;
- a highlighted card center means move into that folder.

For keyboard and touch users, each folder action menu provides **Nach oben**,
**Nach unten** and **In anderen Ordner verschieben**. A polite live region
announces the result. The card body remains a normal navigation target; only the
drag handle initiates pointer dragging.

### Document page

The document page contains the global search, upload action, ownership scope,
filter/sort controls and the document result grid.

When a folder is selected, the page shows its breadcrumb and states that results
include descendants. The server computes all descendant folder IDs and applies
them to the normal document query, not only to full-text search.

Preview cards remain the default. Each card contains:

- first-page preview;
- title limited to two lines;
- year/date and file size where available;
- relative folder path;
- visibility;
- favorite control and a compact action menu.

Move, tag and delete forms no longer occupy permanent space inside every card.
They move into the action menu. The whole primary card surface opens the
document.

### Search mode

A search submitted from either route navigates to `/documents?q=<query>`.
Search mode replaces the regular folder context and document listing with only:

- a `Suchergebnisse für …` heading;
- result count;
- matching result cards with page/excerpt context where available;
- an action to clear the search.

### Empty, loading and error states

- Empty folders provide upload and back-to-folders actions.
- Empty searches suggest changing or clearing the query.
- Loading skeletons match folder or document card geometry.
- Page errors offer a clear retry path.
- Missing or inaccessible folder IDs fail safely and return users to `/folders`.

### Accessibility and responsive behavior

- Use semantic navigation, headings, forms, links and buttons.
- Preserve visible focus indicators and 44 by 44 pixel minimum hit areas.
- Give icon-only controls contextual accessible names.
- Use `aria-current` for active navigation and live regions for result and
  drag-and-drop status.
- Keep every drag-and-drop operation available through an action menu.
- Prevent moving a folder into itself, one of its descendants, or a folder with
  incompatible private/family visibility.
- Verify at 375, 768, 1024 and 1440 pixel viewports.

## Alternatives considered

### One route with folder/document tabs

This reduces routing changes but retains mixed responsibilities and less clear
URLs. Rejected because the desired separation would remain mostly visual.

### Folder master-detail view

Keeping folder navigation beside an expandable document panel makes switching
fast, but recreates the density of the current hub and performs poorly on small
screens. Rejected.

## Decision log

1. Separate folders and documents into two first-class pages to establish clear
   responsibility and navigation.
2. Remove the duplicate folder sidebar and browse one hierarchy level at a time.
3. Include descendant documents when a folder is opened.
4. Show each result's relative folder path so descendant origin remains visible.
5. Keep preview cards as the default, but remove permanent secondary forms from
   their surfaces.
6. Replace the normal page content with search results while search is active.
7. Retain server pagination and existing authorization and mutation boundaries.
8. Persist sibling folder order and support both reordering and hierarchy moves
   through unambiguous drag targets.
9. Keep `Unsortiert` fixed and provide keyboard/touch ordering alternatives.

## Verification strategy

- Add route and rendering tests for `/folders` and the simplified `/documents`.
- Test recursive folder filtering and relative-path generation.
- Test persistent sibling ordering, cross-parent moves, cycle rejection,
  visibility rejection and fixed system-folder behavior.
- Test search-only rendering and query clearing.
- Test empty states and active navigation semantics.
- Run the full unit test suite, TypeScript check, ESLint and production build.
- Perform browser checks at the supported responsive widths.
