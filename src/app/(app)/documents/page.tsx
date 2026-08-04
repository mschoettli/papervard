import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Archive,
  ChevronRight,
  Download,
  Eye,
  FileUp,
  Folder,
  FolderOpen,
  Heart,
  Lock,
  MoreHorizontal,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Users
} from "lucide-react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DocumentBulkWorkspace, DocumentSelectionCheckbox } from "@/components/document-bulk-workspace";
import { DocumentThumbnail } from "@/components/document-thumbnail";
import { TagSelectionModal } from "@/components/library-modals";
import { ResumableUpload } from "@/components/resumable-upload";
import { formatBytes } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import {
  moveDocumentAction,
  toggleFavoriteDocumentAction,
  trashDocumentAction
} from "@/server/actions/documents";
import {
  emptyTrashAction,
  permanentlyDeleteTrashItemAction,
  purgeExpiredTrash,
  restoreTrashItemAction,
  updateDocumentTagsAction
} from "@/server/actions/library";
import { requireUser } from "@/server/auth";
import { documentScopeWhere, householdIdsForUser, type DocumentScope } from "@/server/documents/access";
import { collectDescendantFolderIds, folderAccessWhere, trashExpiresAt } from "@/server/documents/folders";
import { supportedUploadExtensions } from "@/server/documents/formats";
import { hybridSearch } from "@/server/search/search";

const PAGE_SIZE = 24;

type DocumentCard = {
  id: string;
  title: string;
  year: number;
  size: bigint;
  visibility: "private" | "family";
  folderId: string;
  folder: { id: string; name: string };
  favorites: Array<{ id: string }>;
  tags: Array<{ tagId: string; tag: { id: string; name: string; color: string } }>;
};

type TrashedDocument = { id: string; title: string; deletedAt: Date | null };
type TrashedFolder = { id: string; name: string; deletedAt: Date | null };

type DocumentsSearchParams = {
  q?: string;
  fq?: string;
  folder?: string;
  tags?: string;
  year?: string;
  scope?: string;
  sort?: string;
  page?: string;
  trash?: string;
};

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<DocumentsSearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const trashMode = params.trash === "1";
  const globalQuery = (params.q ?? "").trim();
  const query = globalQuery;
  const scope = parseScope(params.scope);
  const selectedYear = parseYear(params.year);
  const queryYear = !selectedYear && /^\d{4}$/.test(query) ? parseYear(query) : undefined;
  const activeYear = selectedYear ?? queryYear;
  const textQuery = queryYear ? "" : query;
  const sort = ["newest", "year", "title"].includes(params.sort ?? "") ? params.sort! : "newest";
  const page = Math.max(1, Number(params.page) || 1);
  const selectedTagIds = [...new Set((params.tags ?? "").split(",").filter(Boolean))];
  const householdIds = await householdIdsForUser(user.id);
  const isAdmin = user.role === "admin";
  const scopeWhere = documentScopeWhere(user.id, householdIds, scope, isAdmin);
  const offset = (page - 1) * PAGE_SIZE;

  await purgeExpiredTrash();

  const [years, folders, tags] = await Promise.all([
    prisma.document.findMany({
      where: documentScopeWhere(user.id, householdIds, "all", isAdmin),
      select: { year: true },
      distinct: ["year"],
      orderBy: { year: "desc" }
    }),
    prisma.folder.findMany({
      where: folderAccessWhere(user.id, householdIds, isAdmin),
      include: {
        _count: { select: { documents: { where: { deletedAt: null } } } },
        tags: { include: { tag: true } }
      },
      orderBy: [{ isSystem: "desc" }, { position: "asc" }, { name: "asc" }]
    }),
    prisma.tag.findMany({
      where: { householdId: { in: householdIds } },
      include: { _count: { select: { documents: true } } },
      orderBy: { name: "asc" }
    })
  ]);

  const currentFolder = params.folder ? folders.find((folder) => folder.id === params.folder) : undefined;
  if (params.folder && !currentFolder) redirect("/folders");
  const recursiveFolderIds = currentFolder
    ? collectDescendantFolderIds(folders.map(({ id, parentId }) => ({ id, parentId })), currentFolder.id)
    : [];
  const tagConditions = selectedTagIds.map((tagId) => ({ tags: { some: { tagId } } }));
  const listWhere = {
    AND: [
      scopeWhere,
      activeYear ? { year: activeYear } : {},
      currentFolder ? { folderId: { in: recursiveFolderIds } } : {},
      ...tagConditions
    ]
  };

  const [listResult, searchResult, trashedDocuments, trashedFolders] = await Promise.all([
    textQuery || trashMode
      ? Promise.resolve({ documents: [], total: 0 })
      : Promise.all([
          prisma.document.findMany({
            where: listWhere,
            include: {
              favorites: { where: { userId: user.id }, select: { id: true } },
              owner: { select: { name: true } },
              folder: { select: { id: true, name: true } },
              tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } }
            },
            orderBy: sort === "title"
              ? [{ title: "asc" }]
              : sort === "year"
                ? [{ year: "desc" }, { title: "asc" }]
                : [{ createdAt: "desc" }],
            take: PAGE_SIZE,
            skip: offset
          }),
          prisma.document.count({ where: listWhere })
        ]).then(([documents, total]) => ({ documents, total })),
    textQuery && !trashMode
      ? hybridSearch(user.id, textQuery, {
          isAdmin,
          year: activeYear,
          scope,
          folderIds: currentFolder ? recursiveFolderIds : [],
          tagIds: selectedTagIds,
          limit: PAGE_SIZE,
          offset
        })
      : Promise.resolve({ results: [], total: 0 }),
    trashMode
      ? prisma.document.findMany({
          where: {
            deletedAt: { not: null },
            ...(isAdmin
              ? { householdId: { in: householdIds } }
              : { OR: [
                  { ownerUserId: user.id },
                  { visibility: "family", householdId: { in: householdIds } }
                ] })
          },
          orderBy: { deletedAt: "desc" }
        })
      : Promise.resolve([]),
    trashMode
      ? prisma.folder.findMany({
          where: {
            deletedAt: { not: null },
            isSystem: false,
            ...(isAdmin
              ? { householdId: { in: householdIds } }
              : { OR: [
                  { visibility: "private", createdByUserId: user.id },
                  { visibility: "family", householdId: { in: householdIds } }
                ] })
          },
          orderBy: { deletedAt: "desc" }
        })
      : Promise.resolve([])
  ]);

  const total = textQuery ? searchResult.total : listResult.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const breadcrumbs = currentFolder ? buildBreadcrumbs(folders, currentFolder.id) : [];
  const searchDocumentVisibility = textQuery
    ? await prisma.document.findMany({
        where: { id: { in: searchResult.results.map((result) => result.documentId) } },
        select: { id: true, visibility: true }
      })
    : [];
  const visibilityById = new Map(searchDocumentVisibility.map((document) => [document.id, document.visibility]));
  const visibleDocuments = textQuery
    ? searchResult.results.map((result) => ({ id: result.documentId, visibility: visibilityById.get(result.documentId) ?? "private" as const }))
    : listResult.documents.map((document) => ({ id: document.id, visibility: document.visibility }));
  const documentResults = (
    <DocumentBulkWorkspace
      selectionContextKey={JSON.stringify({ query: textQuery, folder: currentFolder?.id, scope, year: activeYear, tags: selectedTagIds, page })}
      visibleDocuments={visibleDocuments}
      total={total}
      querySelection={{
        mode: "query",
        ...(textQuery ? { query: textQuery } : {}),
        ...(currentFolder ? { folderId: currentFolder.id } : {}),
        scope,
        ...(activeYear ? { year: activeYear } : {}),
        tagIds: selectedTagIds,
        excludeIds: []
      }}
      folders={folders.map((folder) => ({ id: folder.id, name: folder.name, visibility: folder.visibility }))}
      tags={tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color }))}
    >
      <DocumentResults total={total} query={query} textQuery={textQuery} searchResults={searchResult.results} documents={listResult.documents} folders={folders} tags={tags} currentFolderId={currentFolder?.id} />
    </DocumentBulkWorkspace>
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Papervard Archiv</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Dokumente</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Suchen, ablegen und gemeinsam verwalten.</p>
        </div>
        <Link
          href={trashMode ? "/documents" : "/documents?trash=1"}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
        >
          {trashMode ? <Archive aria-hidden="true" size={18} /> : <Trash2 aria-hidden="true" size={18} />}
          {trashMode ? "Zum Archiv" : "Papierkorb"}
        </Link>
      </header>

      {trashMode ? (
        <TrashView documents={trashedDocuments} folders={trashedFolders} />
      ) : (
        <>
          <GlobalSearch query={globalQuery} scope={scope} />

          {query ? (
            <section className="space-y-5" aria-labelledby="search-results-heading">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="search-results-heading" className="font-display text-2xl font-semibold">Suchergebnisse für „{query}“</h2>
                  <p aria-live="polite" className="mt-1 text-sm text-muted-foreground"><span className="tabular-nums font-medium text-foreground">{total}</span> Treffer</p>
                </div>
                <Link href="/documents" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-medium hover:bg-muted">Suche zurücksetzen</Link>
              </div>
              {documentResults}
              <Pagination page={page} totalPages={totalPages} params={params} />
            </section>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <nav aria-label="Dokumentbereich" className="flex gap-1 overflow-x-auto">
                  <ScopeLink label="Alle" value="all" current={scope} params={params} />
                  <ScopeLink label="Meine Dokumente" value="mine" current={scope} params={params} />
                  <ScopeLink label="Familie" value="family" current={scope} params={params} />
                  <ScopeLink label="Favoriten" value="favorites" current={scope} params={params} />
                </nav>
                <Link href="/folders" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-medium hover:bg-muted">Ordner wechseln</Link>
              </div>

              {currentFolder ? (
                <section className="rounded-2xl border border-primary/15 bg-primary/5 p-4" aria-labelledby="folder-context-heading">
                  <nav aria-label="Ausgewählter Ordner" className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm text-muted-foreground">
                    {breadcrumbs.map((folder, index) => <span key={folder.id} className="flex shrink-0 items-center gap-1">{index > 0 ? <ChevronRight size={14} /> : null}{folder.name}</span>)}
                  </nav>
                  <h2 id="folder-context-heading" className="mt-2 font-display text-xl font-semibold">{currentFolder.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground"><span className="tabular-nums font-medium text-foreground">{total}</span> Dokumente inklusive Unterordner</p>
                </section>
              ) : null}

              <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
                <FilterPanel params={params} query={query} scope={scope} years={years} activeYear={activeYear} sort={sort} tags={tags} selectedTagIds={selectedTagIds} />
                <UploadPanel folders={folders} />
              </section>

              <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <p><span className="tabular-nums font-medium text-foreground">{total}</span> {total === 1 ? "Dokument" : "Dokumente"}</p>
                {activeYear ? <p>Jahr: {activeYear}</p> : null}
              </div>
              {documentResults}
              <Pagination page={page} totalPages={totalPages} params={params} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GlobalSearch({ query, scope }: { query: string; scope: DocumentScope }) {
  return (
    <section aria-labelledby="global-search-title" className="rounded-2xl bg-surface p-4 shadow-[0_1px_0_rgba(20,40,35,0.06),0_14px_38px_rgba(20,40,35,0.06)] sm:p-5">
      <h2 id="global-search-title" className="sr-only">Alle Dokumente durchsuchen</h2>
      <form className="flex flex-col gap-3 sm:flex-row">
        <input type="hidden" name="scope" value={scope} />
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Alle Dokumente durchsuchen</span>
          <Search aria-hidden="true" size={20} className="pointer-events-none absolute left-4 top-3 text-muted-foreground" />
          <input name="q" type="search" defaultValue={query} placeholder="Alle Dokumente durchsuchen …" className="h-11 w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-base outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </label>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.96]">
          <Search aria-hidden="true" size={18} /> Global suchen
        </button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Durchsucht Titel, Dateiname, Jahr und den erkannten PDF-Text in allen zugänglichen Ordnern.</p>
    </section>
  );
}

function FilterPanel({ params, query, scope, years, activeYear, sort, tags, selectedTagIds }: {
  params: DocumentsSearchParams;
  query: string;
  scope: DocumentScope;
  years: { year: number }[];
  activeYear?: number;
  sort: string;
  tags: { id: string; name: string; color: string }[];
  selectedTagIds: string[];
}) {
  return (
    <details className="rounded-2xl bg-surface shadow-[0_1px_0_rgba(20,40,35,0.06),0_10px_28px_rgba(20,40,35,0.05)]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal aria-hidden="true" size={17} /> Filtern und sortieren
      </summary>
      <form className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
        {query ? <input type="hidden" name={params.fq ? "fq" : "q"} value={query} /> : null}
        {params.folder ? <input type="hidden" name="folder" value={params.folder} /> : null}
        <input type="hidden" name="scope" value={scope} />
        <label className="text-sm font-medium">Jahr
          <select name="year" defaultValue={activeYear ?? ""} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3">
            <option value="">Alle Jahre</option>
            {years.map((item) => <option key={item.year} value={item.year}>{item.year}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Sortierung
          <select name="sort" defaultValue={sort} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3">
            <option value="newest">Neueste zuerst</option>
            <option value="year">Jahr</option>
            <option value="title">Titel</option>
          </select>
        </label>
        {tags.length > 0 ? (
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">Tags – alle gewählten müssen zutreffen</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id);
                const nextTags = selected ? selectedTagIds.filter((id) => id !== tag.id) : [...selectedTagIds, tag.id];
                return (
                  <Link key={tag.id} href={queryHref(params, { tags: nextTags.length ? nextTags.join(",") : undefined, page: undefined })} className={`flex min-h-11 items-center gap-2 rounded-full px-3 text-sm ${selected ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <span className="sr-only">{selected ? "Ausgewählt: " : ""}</span><span className="h-2.5 w-2.5 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.1)]" style={{ backgroundColor: tag.color }} /> {tag.name}
                  </Link>
                );
              })}
            </div>
            <input type="hidden" name="tags" value={selectedTagIds.join(",")} />
            <p className="mt-2 text-xs text-muted-foreground">Mehrere gewählte Tags werden mit UND verknüpft.</p>
          </fieldset>
        ) : null}
        <button className="min-h-11 rounded-lg bg-muted px-4 text-sm font-medium transition-transform active:scale-[0.96] sm:col-span-2">Anwenden</button>
      </form>
    </details>
  );
}

function UploadPanel({ folders }: { folders: Array<{ id: string; name: string; parentId: string | null; visibility: "private" | "family" }> }) {
  return (
    <details className="rounded-2xl border border-primary/15 bg-primary/5">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
        <FileUp aria-hidden="true" size={18} /> Dateien hinzufügen
      </summary>
      <div className="px-4 pb-4">
        <ResumableUpload
          accept={supportedUploadExtensions().join(",")}
          folders={folders.map((folder) => ({ id: folder.id, name: folder.name, visibility: folder.visibility }))}
        />
      </div>
    </details>
  );
}

function DocumentResults({ total, query, textQuery, searchResults, documents, folders, tags, currentFolderId }: {
  total: number;
  query: string;
  textQuery: string;
  searchResults: Array<{ chunkId: string; documentId: string; page: number; title: string; year: number; excerpt: string }>;
  documents: DocumentCard[];
  folders: Array<{ id: string; name: string; parentId: string | null; visibility: "private" | "family" }>;
  tags: Array<{ id: string; name: string; color: string }>;
  currentFolderId?: string;
}) {
  if (total === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-surface/70 p-10 text-center">
        <FolderOpen aria-hidden="true" size={34} className="mx-auto text-muted-foreground" />
        <h2 className="mt-3 font-display text-xl font-semibold">{query ? "Keine passenden Dokumente" : "Hier liegen noch keine Dokumente"}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{query ? "Ändere den Suchbegriff oder setze die Suche zurück." : "Lade Dateien hoch oder wähle einen anderen Ordner."}</p>
      </section>
    );
  }
  if (textQuery) {
    return (
      <div className="space-y-3">
        {searchResults.map((result) => (
          <article key={result.chunkId} className="group relative rounded-2xl bg-surface p-4 pl-16 shadow-[0_1px_0_rgba(20,40,35,0.06),0_10px_28px_rgba(20,40,35,0.05)] transition-[background-color,box-shadow] has-[input:checked]:bg-primary/5 has-[input:checked]:ring-2 has-[input:checked]:ring-primary">
            <DocumentSelectionCheckbox documentId={result.documentId} title={result.title} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Link href={`/documents/${result.documentId}?page=${result.page}&q=${encodeURIComponent(textQuery)}`} className="font-semibold hover:underline">{result.title}</Link>
                <p className="mt-1 text-xs text-muted-foreground">{result.year} · Treffer auf Seite {result.page}</p>
                <p className="mt-3 text-sm leading-6">{result.excerpt}</p>
              </div>
                  <Link href={`/documents/${result.documentId}?page=${result.page}&q=${encodeURIComponent(textQuery)}`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-muted px-3 text-sm font-medium"><Eye size={17} /> Öffnen</Link>
            </div>
          </article>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
      {documents.map((document) => (
        <article key={document.id} className="group relative flex h-full flex-col rounded-2xl bg-surface p-3 shadow-[0_1px_0_rgba(20,40,35,0.06),0_8px_24px_rgba(20,40,35,0.06)] transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(20,40,35,0.11)] has-[input:checked]:bg-primary/5 has-[input:checked]:ring-2 has-[input:checked]:ring-primary motion-reduce:hover:translate-y-0">
            <DocumentSelectionCheckbox documentId={document.id} title={document.title} />
            <Link href={`/documents/${document.id}`} className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <DocumentThumbnail documentId={document.id} title={document.title} />
            </Link>
            <div className="mt-3 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-medium">
                  {document.visibility === "private" ? <Lock size={12} /> : <Users size={12} />}{document.visibility === "private" ? "Nur ich" : "Familie"}
                </span>
                <span className="truncate text-muted-foreground">{relativeFolderPath(folders, currentFolderId, document.folderId)}</span>
              </div>
              <h2 className="mt-2 line-clamp-2 break-words text-sm font-semibold leading-5">{document.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{document.year} · {formatBytes(document.size)}</p>
              {document.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {document.tags.map(({ tag }) => <TagChip key={tag.id} tag={tag} />)}
                </div>
              ) : null}
            </div>
            <details className="mt-2 border-t border-border/70 pt-1">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden"><MoreHorizontal size={16} /> Ablegen und Tags</summary>
              <div className="grid gap-3 pt-2">
                <form action={moveDocumentAction} className="flex gap-2">
                  <input type="hidden" name="documentId" value={document.id} />
                  <FolderSelect name="targetFolderId" folders={folders.filter((folder) => folder.visibility === document.visibility)} defaultValue={document.folderId} compact />
                  <button className="min-h-11 rounded-lg bg-muted px-3 text-xs font-medium">Verschieben</button>
                </form>
                <TagSelectionModal
                  subjectId={document.id}
                  subjectName={document.title}
                  subjectType="document"
                  tags={tags}
                  selectedTagIds={document.tags.map((item) => item.tagId)}
                  updateAction={updateDocumentTagsAction}
                  compact
                />
                <form action={trashDocumentAction}>
                  <input type="hidden" name="documentId" value={document.id} />
                  <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-50 px-3 text-xs font-medium text-red-700"><Trash2 size={15} /> In Papierkorb</button>
                </form>
              </div>
            </details>
            <div className="mt-auto grid grid-cols-3 gap-1.5 pt-3">
              <form action={toggleFavoriteDocumentAction}>
                <input type="hidden" name="documentId" value={document.id} />
                <button aria-label={document.favorites.length > 0 ? "Favorit entfernen" : "Als Favorit merken"} className="flex min-h-11 w-full items-center justify-center rounded-lg bg-muted">
                  <Heart size={16} className={document.favorites.length > 0 ? "fill-red-500 text-red-500" : ""} />
                </button>
              </form>
              <Link href={`/documents/${document.id}`} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-muted text-xs font-medium"><Eye size={16} /> Ansehen</Link>
              <a href={`/api/documents/${document.id}/download`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-muted" aria-label={`${document.title} herunterladen`}><Download size={16} /></a>
            </div>
        </article>
      ))}
    </div>
  );
}

function TrashView({ documents, folders }: { documents: TrashedDocument[]; folders: TrashedFolder[] }) {
  const empty = documents.length === 0 && folders.length === 0;
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Papierkorb</h2>
          <p className="mt-1 text-sm text-muted-foreground">Elemente werden nach 30 Tagen automatisch endgültig gelöscht.</p>
        </div>
        {!empty ? (
          <form action={emptyTrashAction}>
            <ConfirmSubmitButton message="Papierkorb endgültig leeren? Diese Aktion kann nicht rückgängig gemacht werden." className="bg-red-700 text-white"><Trash2 size={17} /> Papierkorb leeren</ConfirmSubmitButton>
          </form>
        ) : null}
      </div>
      {empty ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/70 p-10 text-center"><Trash2 size={34} className="mx-auto text-muted-foreground" /><h3 className="mt-3 font-semibold">Der Papierkorb ist leer</h3></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {folders.map((folder) => <TrashCard key={`folder-${folder.id}`} type="folder" id={folder.id} title={folder.name} deletedAt={folder.deletedAt!} />)}
          {documents.map((document) => <TrashCard key={`document-${document.id}`} type="document" id={document.id} title={document.title} deletedAt={document.deletedAt!} />)}
        </div>
      )}
    </section>
  );
}

function TrashCard({ type, id, title, deletedAt }: { type: "document" | "folder"; id: string; title: string; deletedAt: Date }) {
  const days = Math.max(0, Math.ceil((trashExpiresAt(deletedAt).getTime() - Date.now()) / 86_400_000));
  return (
    <article className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">{type === "folder" ? <Folder size={20} /> : <Archive size={20} />}</span>
        <div className="min-w-0"><h3 className="truncate font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">Noch <span className="tabular-nums">{days}</span> Tage wiederherstellbar</p></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <form action={restoreTrashItemAction}>
          <input type="hidden" name="type" value={type} /><input type="hidden" name="id" value={id} />
          <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-muted px-3 text-xs font-medium"><RotateCcw size={15} /> Wiederherstellen</button>
        </form>
        <form action={permanentlyDeleteTrashItemAction}>
          <input type="hidden" name="type" value={type} /><input type="hidden" name="id" value={id} />
          <ConfirmSubmitButton message={`„${title}“ endgültig löschen?`} className="w-full bg-red-50 text-xs text-red-700">Endgültig löschen</ConfirmSubmitButton>
        </form>
      </div>
    </article>
  );
}

function FolderSelect({ folders, name, id, defaultValue, includeRoot = false, includeUnsortedPlaceholder = false, compact = false }: {
  folders: Array<{ id: string; name: string; parentId: string | null; visibility: "private" | "family" }>;
  name: string;
  id?: string;
  defaultValue?: string;
  includeRoot?: boolean;
  includeUnsortedPlaceholder?: boolean;
  compact?: boolean;
}) {
  return (
    <select id={id} name={name} defaultValue={defaultValue ?? ""} className={`${compact ? "h-11 min-w-0 flex-1 text-xs" : "h-11 w-full text-sm"} rounded-lg border border-border bg-surface px-3`}>
      {includeUnsortedPlaceholder ? <option value="">Automatisch nach „Unsortiert“</option> : null}
      {includeRoot ? <option value="">Oberste Ebene</option> : null}
      {flattenFolders(folders).map(({ folder, depth }) => <option key={folder.id} value={folder.id}>{folder.visibility === "private" ? "Privat" : "Familie"} · {"— ".repeat(depth)}{folder.name}</option>)}
    </select>
  );
}

function TagChip({ tag }: { tag: { name: string; color: string } }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-[11px] font-medium"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />{tag.name}</span>;
}

function relativeFolderPath<T extends { id: string; name: string; parentId: string | null }>(folders: T[], rootFolderId: string | undefined, folderId: string) {
  const path = buildBreadcrumbs(folders, folderId);
  const rootIndex = rootFolderId ? path.findIndex((folder) => folder.id === rootFolderId) : -1;
  return (rootIndex >= 0 ? path.slice(rootIndex) : path).map((folder) => folder.name).join(" › ");
}

function Pagination({ page, totalPages, params }: { page: number; totalPages: number; params: DocumentsSearchParams }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Seitennavigation" className="flex items-center justify-center gap-3">
      {page > 1 ? <Link className="inline-flex min-h-11 items-center rounded-lg bg-surface px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted" href={pageHref(params, page - 1)}>Zurück</Link> : null}
      <span className="tabular-nums text-sm text-muted-foreground">Seite {page} von {totalPages}</span>
      {page < totalPages ? <Link className="inline-flex min-h-11 items-center rounded-lg bg-surface px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted" href={pageHref(params, page + 1)}>Weiter</Link> : null}
    </nav>
  );
}

function parseScope(value?: string): DocumentScope {
  return ["all", "mine", "family", "favorites"].includes(value ?? "") ? value as DocumentScope : "all";
}

function parseYear(value?: string) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear() + 1 ? year : undefined;
}

function queryHref(params: DocumentsSearchParams, changes: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...changes })) if (value && key !== "page") next.set(key, value);
  return `/documents${next.size ? `?${next.toString()}` : ""}`;
}

function pageHref(params: DocumentsSearchParams, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
  next.set("page", String(page));
  return `/documents?${next.toString()}`;
}

function ScopeLink({ label, value, current, params }: { label: string; value: DocumentScope; current: DocumentScope; params: DocumentsSearchParams }) {
  const active = value === current;
  return <Link href={queryHref(params, { scope: value === "all" ? undefined : value })} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-3 py-2 text-xs font-medium transition-[background-color,color] ${active ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:bg-muted"}`}>{label}</Link>;
}

function flattenFolders<T extends { id: string; parentId: string | null; name: string }>(folders: T[]) {
  const children = new Map<string | null, T[]>();
  for (const folder of folders) children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder]);
  const result: Array<{ folder: T; depth: number }> = [];
  const seen = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    for (const folder of children.get(parentId) ?? []) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      result.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

function buildBreadcrumbs<T extends { id: string; parentId: string | null }>(folders: T[], currentId: string) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const result: T[] = [];
  const seen = new Set<string>();
  let current = byId.get(currentId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    result.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return result;
}
