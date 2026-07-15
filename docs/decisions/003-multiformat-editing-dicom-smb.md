# ADR-003: Local multi-format library, editing, DICOM and SMB

## Status

Accepted

## Date

2026-07-15

## Context

Papervard currently stores, extracts, previews and indexes PDF files. It is intended to become a local document archive for families and small teams that also handles office documents, spreadsheets, presentations, images and scans, email, DRM-free ebooks and DICOM studies.

The system must remain local, work on ARM64 and x86-64 through Docker, support files without an application-defined size limit, keep every version indefinitely, allow collaborative editing and expose an administrator-only writable SMB library. The existing nested folders, fixed `Unsortiert` folders, manual tags and 30-day trash remain part of the product.

## Decision

### Architecture

Use a modular local Docker architecture:

- Papervard owns authentication, authorization, folders, tags, collections, versions, search and processing state.
- A resumable upload gateway streams data into staging storage.
- Durable PostgreSQL jobs coordinate restart-safe processing workers.
- Format-specific workers validate, extract, convert, OCR and render previews.
- ONLYOFFICE Docs provides local real-time editing for supported documents, spreadsheets, presentations and PDFs.
- Browser-native viewers handle PDF, images, text, ebooks and DICOM.
- Cornerstone3D provides DICOM stack, volume, window/level, cine, measurement, ROI, annotation and segmentation tools.
- An administrator-only Samba service exposes a synchronized working library.

### Persistent storage

Expose exactly two configurable host roots:

- `config`: configuration, encryption keys, SMB settings and service secrets.
- `data`: database state, immutable blobs, versions, previews, thumbnails, staging files, DICOM data and the SMB working library.

All persistent container state must live below one of these two roots. Originals, derived previews and versions are separate. Content-addressed immutable blobs are deduplicated by SHA-256.

### Formats and processing

Support broad local handling for:

- Documents: PDF, DOC/DOCX, ODT, RTF, TXT, Markdown, HTML, TeX and locally convertible Pages files.
- Spreadsheets: XLS/XLSX/XLSM, ODS, CSV/TSV and locally convertible Numbers files.
- Presentations: PPT/PPTX, ODP and locally convertible Keynote files.
- Images/scans: JPEG, PNG, TIFF, WebP, GIF, BMP, HEIF/HEIC, AVIF, SVG and locally decodable camera RAW files.
- Email: EML, MSG and MBOX with attachments.
- Ebooks: EPUB, FB2, MOBI and DRM-free AZW/AZW3.
- Medical imaging: DICOM instances, folders, archives, studies and series.
- Import containers: directories, ZIP, TAR, GZ/TGZ, 7Z and locally extractable RAR files.

Actual file signatures take precedence over extensions. Active content and macros are never executed. Passwords are requested when needed, used in worker memory and never stored. Unsupported or failed conversions retain the downloadable original.

Uploads are chunked, resumable and restart-safe. Papervard has no application-defined file-size limit; hardware, filesystem and proxy limits still apply. Workers check resources and pause rather than exhausting the host.

### Collections, folders and tags

Directory and archive imports create flat collections. Their files remain independent documents that can be searched, tagged, moved and deleted. Deep source directory trees are not recreated automatically.

Manual family-scoped tags remain the only tagging mechanism. AI-generated tags and external AI APIs are excluded. Members may create, edit and assign tags to documents, folders, collections and DICOM series.

### Editing and versions

Store originals unchanged. Each material save creates a new immutable `DocumentVersion`; all versions are retained indefinitely. Identical bytes share a blob. Restoring an old version creates a new current version without rewriting history.

- Office formats use ONLYOFFICE for real-time collaborative editing.
- Text formats use a native editor.
- PDF and images support safe editing and annotation through derived versions.
- Email, ebooks and DICOM retain their original source and store annotations or derived editable copies.
- DICOM annotations and measurements never modify original medical pixels.

All members with access to a family document may edit, comment and create versions. Private documents are visible to their owner and administrators. Administrators may manage and edit every private document. Non-real-time editors submit an optimistic base-version token; stale saves create inactive conflict versions instead of overwriting newer data.

The content log records versions, restores, comments, annotations and ownership changes. It does not record views, downloads, searches, navigation or passive editor presence.

### DICOM

Represent a DICOM study as one library document containing series and instances. Protect extracted patient name, birth date and patient ID with application-level field encryption and exclude them from general full-text search.

By explicit product decision, original DICOM files are not encrypted or anonymized by Papervard. They remain byte-for-byte available and may contain readable patient data. Host/NAS disk encryption, protected backups and restricted SMB access are therefore operational requirements.

### SMB

Expose one writable SMB tree to administrators only:

```text
Papervard/
├── Familie/
│   └── <member>/
└── Privat/
    └── <member>/
```

The member directory represents document ownership. Moving an item between member directories transfers ownership. Moving between `Familie` and `Privat` changes visibility. New files and directories are imported, edits create versions, renames and moves update Papervard, and deletions enter the 30-day trash. SMB changes are attributed to `SMB-Administrator`.

A stabilization window and periodic reconciliation prevent ingestion of partially written files and recover missed filesystem events. Concurrent web and SMB edits create conflict versions.

## Alternatives considered

### Collabora/LibreOffice-centered architecture

Provides strong open-format support but requires a more complex WOPI integration and still needs separate pipelines for images, email, ebooks and DICOM.

### One application container with custom editors

Has fewer services but cannot provide reliable Office compatibility, real-time collaboration, restart-safe conversion and broad medical imaging support without recreating mature products.

### Read-only SMB export

Would protect the canonical store but does not meet the requirement to create, edit, rename, move and delete documents through SMB.

### Encrypt original DICOM files in Papervard

Would improve protection at rest but was explicitly rejected. Originals remain unencrypted; deployment-level storage encryption carries that responsibility.

## Consequences

- The Docker stack is larger and needs more memory, especially for ONLYOFFICE and conversion workers.
- Upload and processing APIs must be generalized beyond PDF.
- Existing documents require a migration into blob and version records without changing access, folder, tag or trash behavior.
- Editor and worker limits may prevent direct editing of exceptionally large files even though storage and upload have no Papervard limit.
- `config` is essential recovery material. Losing its keys makes encrypted database fields unrecoverable.
- Administrators are trusted with all private documents and all SMB content.
- Writable SMB synchronization is a first-class consistency boundary and requires conflict handling, atomic writes and reconciliation tests.

## Verification requirements

- Test fixtures for every format family, using synthetic and anonymized data only.
- Unit tests for signatures, classification, authorization, versions, jobs and SMB path mapping.
- Integration tests for conversion, OCR, password waits, restart recovery and migrations.
- Browser tests for upload progress, viewers, editing, responsive behavior and accessibility.
- DICOM tests for grouping, protected metadata, rendering and annotations.
- SMB tests for create, edit, rename, move, ownership transfer, visibility change, conflicts and trash.
- Docker smoke tests on ARM64 and x86-64 with only `config` and `data` host roots.
