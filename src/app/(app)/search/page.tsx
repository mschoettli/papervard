import Link from "next/link";
import { Download, ExternalLink, Search } from "lucide-react";
import { hybridSearch } from "@/server/search/search";
import { prisma } from "@/lib/prisma";

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; year?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const year = params.year ? Number(params.year) : undefined;
  const results = query.trim() ? await hybridSearch(query, year) : [];
  const years = await prisma.document.findMany({
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" }
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal">Deep Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">Hybrid aus Volltext, OCR-Text und lokaler semantischer Suche.</p>
      </header>
      <form className="grid gap-3 rounded-lg border border-border bg-white p-4 sm:grid-cols-[1fr_160px_auto]">
        <label className="sr-only" htmlFor="q">Suchbegriff</label>
        <input
          id="q"
          name="q"
          defaultValue={query}
          placeholder="Begriff, Frage oder Thema suchen"
          className="h-11 min-w-0 rounded-md border border-border px-3 outline-none focus:border-primary"
        />
        <select name="year" defaultValue={year ?? ""} className="h-11 rounded-md border border-border bg-white px-3">
          <option value="">Alle Jahre</option>
          {years.map((item) => (
            <option key={item.year} value={item.year}>{item.year}</option>
          ))}
        </select>
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
              </div>
              <div className="flex gap-2">
                <Link title="Dokument öffnen" href={`/documents/${result.documentId}`} className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted">
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
