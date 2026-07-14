import Link from "next/link";
import { Download, Eye, FileUp, Heart, Search, SlidersHorizontal, Upload } from "lucide-react";
import { DocumentThumbnail } from "@/components/document-thumbnail";
import { MultiPdfInput } from "@/components/multi-pdf-input";
import { formatBytes } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { toggleFavoriteDocumentAction, uploadPdfAction } from "@/server/actions/documents";
import { requireUser } from "@/server/auth";
import { documentScopeWhere, householdIdsForUser, type DocumentScope } from "@/server/documents/access";
import { hybridSearch } from "@/server/search/search";

const PAGE_SIZE = 24;

type DocumentsSearchParams = {
  q?: string;
  year?: string;
  scope?: string;
  sort?: string;
  page?: string;
};

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<DocumentsSearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const scope = parseScope(params.scope);
  const selectedYear = parseYear(params.year);
  const queryYear = !selectedYear && /^\d{4}$/.test(query) ? parseYear(query) : undefined;
  const activeYear = selectedYear ?? queryYear;
  const textQuery = queryYear ? "" : query;
  const sort = ["newest", "year", "title"].includes(params.sort ?? "") ? params.sort! : "newest";
  const page = Math.max(1, Number(params.page) || 1);
  const householdIds = await householdIdsForUser(user.id);
  const scopeWhere = documentScopeWhere(user.id, householdIds, scope);
  const yearWhere = activeYear ? { year: activeYear } : {};
  const offset = (page - 1) * PAGE_SIZE;

  const [years, listResult, searchResult] = await Promise.all([
    prisma.document.findMany({
      where: documentScopeWhere(user.id, householdIds, "all"),
      select: { year: true },
      distinct: ["year"],
      orderBy: { year: "desc" }
    }),
    textQuery
      ? Promise.resolve({ documents: [], total: 0 })
      : Promise.all([
          prisma.document.findMany({
            where: { AND: [scopeWhere, yearWhere] },
            include: {
              favorites: { where: { userId: user.id }, select: { id: true } },
              owner: { select: { name: true } }
            },
            orderBy: sort === "title"
              ? [{ title: "asc" }]
              : sort === "year"
                ? [{ year: "desc" }, { title: "asc" }]
                : [{ createdAt: "desc" }],
            take: PAGE_SIZE,
            skip: offset
          }),
          prisma.document.count({ where: { AND: [scopeWhere, yearWhere] } })
        ]).then(([documents, total]) => ({ documents, total })),
    textQuery
      ? hybridSearch(user.id, textQuery, {
          year: activeYear,
          scope,
          limit: PAGE_SIZE,
          offset
        })
      : Promise.resolve({ results: [], total: 0 })
  ]);

  const total = textQuery ? searchResult.total : listResult.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal">Dokumente</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Suche nach Titel, Dateiname, Jahr oder Text im Dokument.
        </p>
      </header>

      <section aria-labelledby="document-search-title" className="rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5">
        <h2 id="document-search-title" className="sr-only">Dokumente durchsuchen</h2>
        <form className="flex flex-col gap-3 sm:flex-row">
          <input type="hidden" name="scope" value={scope} />
          {selectedYear ? <input type="hidden" name="year" value={selectedYear} /> : null}
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Dokumente durchsuchen</span>
            <Search aria-hidden="true" size={20} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
            <input
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Zum Beispiel: Rechnung 2024 oder Krankenkasse"
              className="h-11 w-full rounded-md border border-border bg-white pl-10 pr-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <Search aria-hidden="true" size={18} />
            Suchen
          </button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Eine Jahreszahl findet Dokumente aus diesem Jahr; gesucht wird zusätzlich in Titel, Dateiname und PDF-Text.
        </p>
      </section>

      <nav aria-label="Dokumentbereich" className="flex gap-2 overflow-x-auto pb-1">
        <ScopeLink label="Alle" value="all" current={scope} params={params} />
        <ScopeLink label="Meine Dokumente" value="mine" current={scope} params={params} />
        <ScopeLink label="Familie" value="family" current={scope} params={params} />
        <ScopeLink label="Favoriten" value="favorites" current={scope} params={params} />
      </nav>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
        <details className="rounded-lg border border-border bg-white">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal aria-hidden="true" size={17} />
            Filtern und sortieren
          </summary>
          <form className="grid gap-3 border-t border-border p-4 sm:grid-cols-3">
            {query ? <input type="hidden" name="q" value={query} /> : null}
            <input type="hidden" name="scope" value={scope} />
            <label className="text-sm font-medium">
              Jahr
              <select name="year" defaultValue={activeYear ?? ""} className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3">
                <option value="">Alle Jahre</option>
                {years.map((item) => <option key={item.year} value={item.year}>{item.year}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Sortierung
              <select name="sort" defaultValue={sort} className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3">
                <option value="newest">Neueste zuerst</option>
                <option value="year">Jahr</option>
                <option value="title">Titel</option>
              </select>
            </label>
            <button className="mt-auto inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
              Anwenden
            </button>
          </form>
        </details>

        <details className="rounded-lg border border-primary/30 bg-primary/5 lg:w-[360px]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
            <FileUp aria-hidden="true" size={18} />
            PDFs hinzufügen
          </summary>
          <form action={uploadPdfAction} className="space-y-4 border-t border-primary/20 p-4">
            <MultiPdfInput id="document-pdf-files" />
            <p className="text-xs text-muted-foreground">Maximal 50 MB je PDF und 75 MB pro Upload.</p>
            <fieldset>
              <legend className="text-sm font-medium">Wer darf die Dokumente sehen?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <VisibilityOption value="private" label="Nur ich" description="Standard und privat" defaultChecked />
                <VisibilityOption value="family" label="Familie" description="Für alle Mitglieder" />
              </div>
            </fieldset>
            <label className="block text-sm font-medium">
              Jahr (optional)
              <input name="year" type="number" min="1900" max={new Date().getFullYear() + 1} placeholder="Wird automatisch erkannt" className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3" />
            </label>
            <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Upload aria-hidden="true" size={17} />
              Hochladen
            </button>
          </form>
        </details>
      </div>

      <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>{total} {total === 1 ? "Dokument" : "Dokumente"}{query ? ` für „${query}“` : ""}</p>
        {activeYear ? <p>Jahr: {activeYear}</p> : null}
      </div>

      {total === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-white p-8 text-center">
          <h2 className="text-lg font-semibold">{query ? "Keine passenden Dokumente" : "Hier sind noch keine Dokumente"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {query ? "Versuche einen kürzeren Suchbegriff, ein anderes Jahr oder den Bereich „Alle“." : "Öffne „PDFs hinzufügen“, um dein erstes Dokument sicher abzulegen."}
          </p>
        </section>
      ) : textQuery ? (
        <div className="space-y-3">
          {searchResult.results.map((result) => (
            <article key={result.chunkId} className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/documents/${result.documentId}?page=${result.page}&q=${encodeURIComponent(textQuery)}`} className="font-semibold hover:underline">
                    {result.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">{result.year} · Treffer auf Seite {result.page}</p>
                  <p className="mt-3 text-sm leading-6">{result.excerpt}</p>
                </div>
                <Link href={`/documents/${result.documentId}?page=${result.page}&q=${encodeURIComponent(textQuery)}`} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">
                  <Eye aria-hidden="true" size={17} />
                  Öffnen
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {listResult.documents.map((document) => (
            <article key={document.id} className="group flex min-h-[410px] flex-col rounded-xl border border-border bg-white p-4 shadow-sm transition hover:border-primary/35 hover:shadow-md">
              <Link href={`/documents/${document.id}`} className="block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <DocumentThumbnail documentId={document.id} title={document.title} />
              </Link>
              <div className="mt-4 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">
                    {document.visibility === "private" ? "Nur ich" : "Familie"}
                  </span>
                  {document.ownerUserId !== user.id ? <span className="text-xs text-muted-foreground">von {document.owner.name}</span> : null}
                </div>
                <h2 className="mt-2 line-clamp-2 break-words text-sm font-semibold leading-5">{document.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{document.year} · {formatBytes(document.size)}</p>
              </div>
              <div className="mt-4">
                <form action={toggleFavoriteDocumentAction}>
                  <input type="hidden" name="documentId" value={document.id} />
                  <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">
                    <Heart aria-hidden="true" size={15} className={document.favorites.length > 0 ? "fill-red-500 text-red-500" : ""} />
                    {document.favorites.length > 0 ? "Favorit" : "Merken"}
                  </button>
                </form>
              </div>
              <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
                <Link href={`/documents/${document.id}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border text-sm font-medium hover:bg-muted">
                  <Eye aria-hidden="true" size={17} />
                  Ansehen
                </Link>
                <a href={`/api/documents/${document.id}/download`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border text-sm font-medium hover:bg-muted">
                  <Download aria-hidden="true" size={17} />
                  Download
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Seitennavigation" className="flex items-center justify-center gap-3">
          {page > 1 ? <Link className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted" href={pageHref(params, page - 1)}>Zurück</Link> : null}
          <span className="text-sm text-muted-foreground">Seite {page} von {totalPages}</span>
          {page < totalPages ? <Link className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted" href={pageHref(params, page + 1)}>Weiter</Link> : null}
        </nav>
      ) : null}
    </div>
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
  for (const [key, value] of Object.entries({ ...params, ...changes })) {
    if (value && key !== "page") next.set(key, value);
  }
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
  return (
    <Link
      href={queryHref(params, { scope: value === "all" ? undefined : value })}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white hover:bg-muted"}`}
    >
      {label}
    </Link>
  );
}

function VisibilityOption({ value, label, description, defaultChecked = false }: { value: "private" | "family"; label: string; description: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-white p-3 text-sm has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary">
      <input name="visibility" type="radio" value={value} defaultChecked={defaultChecked} className="mt-1" />
      <span><span className="block font-medium">{label}</span><span className="text-xs text-muted-foreground">{description}</span></span>
    </label>
  );
}
