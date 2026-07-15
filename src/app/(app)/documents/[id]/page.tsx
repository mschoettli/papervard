import Link from "next/link";
import { ArrowLeft, Download, Folder, Heart, Lock, RotateCw, Search, Tags, Trash2, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import { formatBytes } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import {
  reindexDocumentAction,
  moveDocumentAction,
  trashDocumentAction,
  toggleFavoriteDocumentAction,
  updateDocumentVisibilityAction
} from "@/server/actions/documents";
import { updateDocumentTagsAction } from "@/server/actions/library";
import { requireUser } from "@/server/auth";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";
import { folderAccessWhere } from "@/server/documents/folders";
import { hybridSearch } from "@/server/search/search";

export default async function DocumentPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const requested = await searchParams;
  const query = (requested.q ?? "").trim();
  const householdIds = await householdIdsForUser(user.id);
  const document = await prisma.document.findFirst({
    where: { id, ...documentAccessWhere(user.id, householdIds) },
    include: {
      owner: { select: { name: true } },
      favorites: { where: { userId: user.id }, select: { id: true } },
      chunks: { select: { id: true, content: true }, take: 8 },
      folder: { select: { id: true, name: true } },
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } }
    }
  });
  if (!document) notFound();

  const [folders, tags] = await Promise.all([
    prisma.folder.findMany({
      where: { ...folderAccessWhere(user.id, householdIds), visibility: document.visibility },
      select: { id: true, name: true, visibility: true },
      orderBy: { name: "asc" }
    }),
    prisma.tag.findMany({
      where: { householdId: document.householdId },
      orderBy: { name: "asc" }
    })
  ]);

  const selectedPage = requested.page ? Math.max(1, Number(requested.page) || 1) : undefined;
  const pdfSrc = `/api/documents/${document.id}/file${selectedPage ? `#page=${selectedPage}` : ""}`;
  const extractedChars = document.chunks.reduce((sum, chunk) => sum + chunk.content.trim().length, 0);
  const textQuality = document.indexStatus !== "indexed" ? "Noch nicht bereit" : extractedChars < 400 ? "Wenig Text erkannt" : "Gut lesbar";
  const matches = query
    ? await hybridSearch(user.id, query, { documentId: document.id, limit: 12 })
    : { results: [], total: 0 };

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <Link href="/documents" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" size={17} />
        Zurück zu Dokumente
      </Link>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium">
              {document.visibility === "private" ? <Lock aria-hidden="true" size={13} /> : <Users aria-hidden="true" size={13} />}
              {document.visibility === "private" ? "Nur ich" : "Familie"}
            </span>
            {document.ownerUserId !== user.id ? <span className="text-xs text-muted-foreground">von {document.owner.name}</span> : null}
          </div>
          <h1 className="break-words text-2xl font-semibold tracking-normal">{document.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{document.year}</span>
            <span>{formatBytes(document.size)}</span>
            <span>{document.pageCount || "?"} Seiten</span>
            <StatusPill status={document.indexStatus} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={toggleFavoriteDocumentAction}>
            <input type="hidden" name="documentId" value={document.id} />
            <Button variant="secondary">
              <Heart aria-hidden="true" size={18} className={document.favorites.length > 0 ? "fill-red-500 text-red-500" : ""} />
              {document.favorites.length > 0 ? "Favorit" : "Merken"}
            </Button>
          </form>
          <a href={`/api/documents/${document.id}/download`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Download aria-hidden="true" size={18} />
            Download
          </a>
        </div>
      </header>

      {document.indexError ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{document.indexError}</p> : null}

      <section aria-labelledby="search-in-document" className="rounded-lg border border-border bg-white p-4">
        <h2 id="search-in-document" className="font-semibold">In diesem Dokument suchen</h2>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Suchbegriff im Dokument</span>
            <Search aria-hidden="true" size={18} className="absolute left-3 top-2.5 text-muted-foreground" />
            <input name="q" type="search" defaultValue={query} placeholder="Wort oder Thema eingeben" className="h-10 w-full rounded-md border border-border pl-10 pr-3" />
          </label>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
            <Search aria-hidden="true" size={17} />
            Suchen
          </button>
        </form>
        {query ? (
          <div className="mt-4 space-y-2" aria-live="polite">
            <p className="text-sm text-muted-foreground">{matches.total} {matches.total === 1 ? "Treffer" : "Treffer"} für „{query}“</p>
            {matches.results.map((result) => (
              <Link key={result.chunkId} href={`/documents/${document.id}?q=${encodeURIComponent(query)}&page=${result.page}`} className="block rounded-md border border-border p-3 text-sm hover:bg-muted">
                <span className="font-medium">Seite {result.page}</span>
                <span className="mt-1 block leading-6 text-muted-foreground">{result.excerpt}</span>
              </Link>
            ))}
            {matches.total === 0 ? <p className="rounded-md bg-muted p-3 text-sm">Kein Treffer. Versuche einen kürzeren Begriff.</p> : null}
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative min-h-[60vh] overflow-hidden rounded-lg border border-border bg-muted">
          <iframe title={`PDF: ${document.title}`} src={pdfSrc} className="h-[72vh] min-h-[560px] w-full bg-white" />
          <noscript><p className="p-4 text-sm">Die PDF-Vorschau benötigt JavaScript. Nutze den Download oben.</p></noscript>
        </div>
        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-white p-4">
            <h2 className="font-semibold">Dokumentdetails</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Info label="Jahr" value={String(document.year)} />
              <Info label="Größe" value={formatBytes(document.size)} />
              <Info label="Seiten" value={String(document.pageCount || "?")} />
              <Info label="Textsuche" value={textQuality} />
              <Info label="Ordner" value={document.folder.name} />
              {selectedPage ? <Info label="Geöffnete Seite" value={String(selectedPage)} /> : null}
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-white p-4">
            <h2 className="flex items-center gap-2 font-semibold"><Folder aria-hidden="true" size={17} /> Ablage</h2>
            <form action={moveDocumentAction} className="mt-3">
              <input type="hidden" name="documentId" value={document.id} />
              <label className="text-sm font-medium" htmlFor="document-folder">Ordner</label>
              <select id="document-folder" name="targetFolderId" defaultValue={document.folderId} className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm">
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
              <button className="mt-2 h-10 w-full rounded-md bg-muted text-sm font-medium">Ordner speichern</button>
            </form>
          </section>

          <form action={updateDocumentTagsAction} className="rounded-lg border border-border bg-white p-4">
            <input type="hidden" name="documentId" value={document.id} />
            <fieldset>
              <legend className="flex items-center gap-2 font-semibold"><Tags aria-hidden="true" size={17} /> Tags</legend>
              <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                {tags.map((tag) => (
                  <label key={tag.id} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted">
                    <input type="checkbox" name="tagId" value={tag.id} defaultChecked={document.tags.some((item) => item.tagId === tag.id)} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </label>
                ))}
                {tags.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Tags angelegt.</p> : null}
              </div>
            </fieldset>
            <button className="mt-3 h-10 w-full rounded-md bg-muted text-sm font-medium">Tags speichern</button>
          </form>

          {document.ownerUserId === user.id ? (
            <form action={updateDocumentVisibilityAction} className="rounded-lg border border-border bg-white p-4">
              <input type="hidden" name="documentId" value={document.id} />
              <label className="text-sm font-medium" htmlFor="visibility">Zugriff</label>
              <select id="visibility" name="visibility" defaultValue={document.visibility} className="mt-2 h-10 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option value="private">Nur ich</option>
                <option value="family">Meine Familie</option>
              </select>
              <button className="mt-3 h-10 w-full rounded-md border border-border text-sm font-medium hover:bg-muted">Zugriff speichern</button>
              <p className="mt-2 text-xs text-muted-foreground">Private Dokumente bleiben auch für Familien-Admins unsichtbar.</p>
            </form>
          ) : null}

          {user.role === "admin" ? (
            <form action={reindexDocumentAction} className="rounded-lg border border-border bg-white p-4">
              <input type="hidden" name="id" value={document.id} />
              <Button variant="secondary" className="w-full">
                <RotateCw aria-hidden="true" size={17} />
                Neu indexieren
              </Button>
            </form>
          ) : null}

          <form action={trashDocumentAction} className="rounded-lg bg-red-50 p-4">
            <input type="hidden" name="documentId" value={document.id} />
            <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm font-medium text-red-700"><Trash2 aria-hidden="true" size={17} /> In Papierkorb</button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}
