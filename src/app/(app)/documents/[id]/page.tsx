import Link from "next/link";
import { Download, FileSearch, Heart, RotateCw } from "lucide-react";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/button";
import { formatBytes } from "@/lib/utils";
import { reindexDocumentAction, toggleFavoriteDocumentAction } from "@/server/actions/documents";
import { requireUser } from "@/server/auth";
import { prisma } from "@/lib/prisma";

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { page } = await searchParams;
  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      favorites: { where: { userId: user.id }, select: { id: true } },
      chunks: { select: { id: true, content: true }, take: 8 }
    }
  });
  if (!document) notFound();
  const selectedPage = page ? Math.max(1, Number(page)) : undefined;
  const pdfSrc = `/api/documents/${document.id}/file${selectedPage ? `#page=${selectedPage}` : ""}`;
  const extractedChars = document.chunks.reduce((sum, chunk) => sum + chunk.content.trim().length, 0);
  const ocrQuality = document.indexStatus !== "indexed" ? "Noch nicht bereit" : extractedChars < 400 ? "Wenig Text erkannt" : "Gut lesbar";

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{document.title}</h1>
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
              <Heart size={18} className={document.favorites.length > 0 ? "fill-red-500 text-red-500" : ""} />
              {document.favorites.length > 0 ? "Favorit" : "Merken"}
            </Button>
          </form>
          <Link href={`/search?title=${encodeURIComponent(document.title)}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-medium hover:bg-muted">
            <FileSearch size={18} />
            Im Dokument suchen
          </Link>
          <a href={`/api/documents/${document.id}/download`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            <Download size={18} />
            Download
          </a>
        </div>
      </header>
      {document.indexError ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{document.indexError}</p> : null}
      <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
        <iframe
          title={document.title}
          src={pdfSrc}
          className="h-[72vh] w-full rounded-lg border border-border bg-white"
        />
        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-white p-4">
            <h2 className="font-semibold">Dokumentdetails</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Info label="Jahr" value={String(document.year)} />
              <Info label="Größe" value={formatBytes(document.size)} />
              <Info label="Seiten" value={String(document.pageCount || "?")} />
              <Info label="OCR/Text" value={ocrQuality} />
              {selectedPage ? <Info label="Geöffnete Seite" value={String(selectedPage)} /> : null}
            </dl>
          </section>
          {user.role === "admin" ? (
            <form action={reindexDocumentAction} className="rounded-lg border border-border bg-white p-4">
              <input type="hidden" name="id" value={document.id} />
              <Button variant="secondary" className="w-full">
                <RotateCw size={17} />
                Neu indexieren
              </Button>
            </form>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
