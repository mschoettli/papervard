import Link from "next/link";
import { BookmarkPlus, Download, ExternalLink, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/button";
import { deleteSavedSearchAction, saveSearchAction } from "@/server/actions/searches";
import { requireUser } from "@/server/auth";
import { hybridSearch, type SearchMode } from "@/server/search/search";
import { prisma } from "@/lib/prisma";

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; year?: string; yearFrom?: string; yearTo?: string; title?: string; mode?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = params.q ?? "";
  const mode = ["hybrid", "keyword", "semantic"].includes(params.mode ?? "") ? (params.mode as SearchMode) : "hybrid";
  const year = params.year ? Number(params.year) : undefined;
  const yearFrom = params.yearFrom ? Number(params.yearFrom) : undefined;
  const yearTo = params.yearTo ? Number(params.yearTo) : undefined;
  const title = params.title ?? "";
  const [results, years, savedSearches] = await Promise.all([
    query.trim() ? hybridSearch(query, { year, yearFrom, yearTo, title, mode }) : [],
    prisma.document.findMany({
      select: { year: true },
      distinct: ["year"],
      orderBy: { year: "desc" }
    }),
    prisma.savedSearch.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 8 })
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Deep Search</h1>
          <p className="mt-1 text-sm text-muted-foreground">Hybrid aus Volltext, OCR-Text und lokaler semantischer Suche.</p>
        </div>
        {query.trim() ? (
          <form action={saveSearchAction} className="grid gap-2 rounded-lg border border-border bg-white p-3 sm:grid-cols-[180px_auto]">
            <input type="hidden" name="query" value={query} />
            <input type="hidden" name="yearFrom" value={yearFrom ?? ""} />
            <input type="hidden" name="yearTo" value={yearTo ?? ""} />
            <input type="hidden" name="title" value={title} />
            <input type="hidden" name="mode" value={mode} />
            <label className="sr-only" htmlFor="saved-name">Name der Suche</label>
            <input id="saved-name" name="name" placeholder="Name der Suche" required className="h-10 rounded-md border border-border px-3 text-sm" />
            <Button variant="secondary">
              <BookmarkPlus size={17} />
              Speichern
            </Button>
          </form>
        ) : null}
      </header>

      {savedSearches.length > 0 ? (
        <section className="flex gap-2 overflow-x-auto pb-1">
          {savedSearches.map((savedSearch) => {
            const href = `/search?q=${encodeURIComponent(savedSearch.query)}&yearFrom=${savedSearch.yearFrom ?? ""}&yearTo=${savedSearch.yearTo ?? ""}&title=${encodeURIComponent(savedSearch.title ?? "")}&mode=${savedSearch.mode}`;
            return (
              <div key={savedSearch.id} className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-white p-1">
                <Link href={href} className="px-3 py-2 text-sm font-medium hover:text-primary">{savedSearch.name}</Link>
                <form action={deleteSavedSearchAction}>
                  <input type="hidden" name="id" value={savedSearch.id} />
                  <button title="Gespeicherte Suche löschen" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Trash2 size={15} />
                  </button>
                </form>
              </div>
            );
          })}
        </section>
      ) : null}

      <form className="grid gap-3 rounded-lg border border-border bg-white p-4 lg:grid-cols-[1.4fr_150px_150px_160px]">
        <div className="lg:col-span-4">
          <label className="sr-only" htmlFor="q">Suchbegriff</label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Begriff, Frage oder Thema suchen"
            className="h-12 w-full min-w-0 rounded-md border border-border px-4 text-base outline-none focus:border-primary"
          />
        </div>
        <select name="mode" defaultValue={mode} className="h-11 rounded-md border border-border bg-white px-3">
          <option value="hybrid">Hybrid</option>
          <option value="keyword">Volltext</option>
          <option value="semantic">Semantik</option>
        </select>
        <select name="year" defaultValue={year ?? ""} className="h-11 rounded-md border border-border bg-white px-3">
          <option value="">Alle Jahre</option>
          {years.map((item) => (
            <option key={item.year} value={item.year}>{item.year}</option>
          ))}
        </select>
        <input name="yearFrom" type="number" min="1900" max="2100" defaultValue={yearFrom ?? ""} placeholder="Von Jahr" className="h-11 rounded-md border border-border px-3" />
        <input name="yearTo" type="number" min="1900" max="2100" defaultValue={yearTo ?? ""} placeholder="Bis Jahr" className="h-11 rounded-md border border-border px-3" />
        <input name="title" defaultValue={title} placeholder="Titel eingrenzen" className="h-11 rounded-md border border-border px-3 lg:col-span-3" />
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          <Search size={18} />
          Suchen
        </button>
      </form>

      {query.trim() && results.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
          <h2 className="text-lg font-semibold">Keine Treffer</h2>
          <p className="mt-2 text-sm text-muted-foreground">Prüfe, ob die PDFs bereits fertig indexiert sind.</p>
        </section>
      ) : null}

      {query.trim() ? <p className="text-sm text-muted-foreground">{results.length} Treffer für <span className="font-medium text-foreground">{query}</span></p> : null}

      <div className="space-y-3">
        {results.map((result) => (
          <article key={result.chunkId} className="rounded-lg border border-border bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Link href={`/documents/${result.documentId}`} className="font-semibold hover:underline">
                  {result.title}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.year} · Seite {result.page} · Relevanz {Math.round(result.score * 100)}%
                </p>
                <div className="mt-2 h-2 max-w-xs overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(6, Math.min(100, Math.round(result.score * 100)))}%` }} />
                </div>
              </div>
              <div className="flex gap-2">
                <Link title="Trefferseite öffnen" href={`/documents/${result.documentId}?page=${result.page}`} className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted">
                  <ExternalLink size={17} />
                </Link>
                <a title="Herunterladen" href={`/api/documents/${result.documentId}/download`} className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted">
                  <Download size={17} />
                </a>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-foreground">{result.excerpt}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
