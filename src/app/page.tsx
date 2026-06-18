import Link from "next/link";
import type React from "react";
import { Archive, Download, Eye, FileSearch, Heart, Upload } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { DocumentThumbnail } from "@/components/document-thumbnail";
import { formatBytes } from "@/lib/utils";
import { toggleFavoriteDocumentAction } from "@/server/actions/documents";
import { requireUser } from "@/server/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const user = await requireUser();
  const [totalDocuments, totalSize, recentDocuments, favoriteRecords, favoriteCount] = await Promise.all([
    prisma.document.count(),
    prisma.document.aggregate({ _sum: { size: true } }),
    prisma.document.findMany({
      include: { favorites: { where: { userId: user.id }, select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 4
    }),
    prisma.favoriteDocument.findMany({
      where: { userId: user.id },
      include: {
        document: {
          include: { favorites: { where: { userId: user.id }, select: { id: true } } }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 4
    }),
    prisma.favoriteDocument.count({ where: { userId: user.id } })
  ]);
  const favoriteDocuments = favoriteRecords.map((favorite) => favorite.document);

  return (
    <div className="min-h-screen lg:flex">
      <AppNav user={user} />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="space-y-7">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Guten Tag, {user.name}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal">Dashboard</h1>
              <p className="mt-2 text-sm text-muted-foreground">Überblick über Bibliothek, Favoriten und letzte Aktivitäten.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/search" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                <FileSearch size={18} />
                Suche öffnen
              </Link>
              {user.role === "admin" ? (
                <Link href="/admin/uploads" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-medium hover:bg-muted">
                  <Upload size={18} />
                  Upload
                </Link>
              ) : null}
            </div>
          </header>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard icon={<Archive size={20} />} label="Dokumente" value={String(totalDocuments)} detail={formatBytes(totalSize._sum.size ?? 0)} />
            <MetricCard icon={<Heart size={20} />} label="Favoriten" value={String(favoriteCount)} detail="für dein Konto" />
            <MetricCard icon={<Upload size={20} />} label="Letzte Uploads" value={String(recentDocuments.length)} detail="neueste PDFs" />
          </section>

          <DocumentSection title="Favoriten" emptyText="Noch keine Favoriten gemerkt." documents={favoriteDocuments} />

          <DocumentSection title="Letzte Uploads" emptyText="Noch keine PDFs vorhanden." documents={recentDocuments} action={<Link href="/documents" className="text-sm font-medium text-primary hover:underline">Alle ansehen</Link>} />
        </div>
      </main>
    </div>
  );
}

type DashboardDocument = {
  id: string;
  title: string;
  year: number;
  size: number;
  favorites: { id: string }[];
};

function DocumentSection({
  title,
  emptyText,
  documents,
  action
}: {
  title: string;
  emptyText: string;
  documents: DashboardDocument[];
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
        {action}
      </div>
      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {documents.map((document) => (
            <DocumentCard key={document.id} document={document} />
          ))}
        </div>
      )}
    </section>
  );
}

function DocumentCard({ document }: { document: DashboardDocument }) {
  return (
    <article className="group flex min-h-[420px] flex-col rounded-lg border border-border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md">
      <Link href={`/documents/${document.id}`} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <DocumentThumbnail documentId={document.id} title={document.title} />
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="line-clamp-2 break-words text-sm font-semibold leading-5">{document.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{document.year} · {formatBytes(document.size)}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <form action={toggleFavoriteDocumentAction}>
          <input type="hidden" name="documentId" value={document.id} />
          <button className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-xs font-medium transition hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <Heart size={15} className={document.favorites.length > 0 ? "fill-red-500 text-red-500" : ""} />
            {document.favorites.length > 0 ? "Favorit" : "Merken"}
          </button>
        </form>
        <span className="text-xs font-medium uppercase text-muted-foreground">PDF</span>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
        <Link title="Ansehen" href={`/documents/${document.id}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border text-sm font-medium transition hover:bg-muted">
          <Eye size={17} />
          Ansehen
        </Link>
        <a title="Herunterladen" href={`/api/documents/${document.id}/download`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border text-sm font-medium transition hover:bg-muted">
          <Download size={17} />
          Download
        </a>
      </div>
    </article>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className="rounded-lg border border-border bg-white p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-sm font-medium">{label}</span>
        {icon}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-normal">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </article>
  );
}
