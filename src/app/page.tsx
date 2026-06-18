import Link from "next/link";
import type React from "react";
import { AlertTriangle, Archive, CheckCircle2, Clock3, FileSearch, Heart, Upload } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { StatusPill } from "@/components/status-pill";
import { formatBytes, statusLabel } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const user = await requireUser();
  const [totalDocuments, totalSize, statusCounts, recentDocuments, favoriteCount, failedDocuments] = await Promise.all([
    prisma.document.count(),
    prisma.document.aggregate({ _sum: { size: true } }),
    prisma.document.groupBy({ by: ["indexStatus"], _count: { _all: true } }),
    prisma.document.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.favoriteDocument.count({ where: { userId: user.id } }),
    prisma.document.findMany({ where: { indexStatus: "failed" }, orderBy: { updatedAt: "desc" }, take: 4 })
  ]);

  const indexed = statusCounts.find((item) => item.indexStatus === "indexed")?._count._all ?? 0;
  const queued = statusCounts.find((item) => item.indexStatus === "queued")?._count._all ?? 0;
  const processing = statusCounts.find((item) => item.indexStatus === "processing")?._count._all ?? 0;
  const failed = statusCounts.find((item) => item.indexStatus === "failed")?._count._all ?? 0;

  return (
    <div className="min-h-screen lg:flex">
      <AppNav user={user} />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="space-y-7">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Guten Tag, {user.name}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal">Dashboard</h1>
              <p className="mt-2 text-sm text-muted-foreground">Überblick über Bibliothek, Indexierung und letzte Aktivitäten.</p>
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

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={<Archive size={20} />} label="Dokumente" value={String(totalDocuments)} detail={formatBytes(totalSize._sum.size ?? 0)} />
            <MetricCard icon={<CheckCircle2 size={20} />} label="Bereit" value={String(indexed)} detail="voll indexiert" />
            <MetricCard icon={<Clock3 size={20} />} label="In Arbeit" value={String(queued + processing)} detail={`${queued} wartet, ${processing} läuft`} />
            <MetricCard icon={<Heart size={20} />} label="Favoriten" value={String(favoriteCount)} detail="für dein Konto" />
          </section>

          {failed > 0 ? (
            <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={18} />
                {failed} Dokument{failed === 1 ? "" : "e"} mit Indexierungsfehler
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {failedDocuments.map((document) => (
                  <Link key={document.id} href={`/documents/${document.id}`} className="rounded-md bg-white/70 p-3 text-sm hover:bg-white">
                    <span className="font-medium">{document.title}</span>
                    <span className="mt-1 block truncate text-xs">{document.indexError}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-lg border border-border bg-white">
              <div className="flex items-center justify-between border-b border-border p-4">
                <h2 className="font-semibold">Letzte Uploads</h2>
                <Link href="/documents" className="text-sm font-medium text-primary hover:underline">Alle ansehen</Link>
              </div>
              <div className="divide-y divide-border">
                {recentDocuments.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Noch keine PDFs vorhanden.</p>
                ) : recentDocuments.map((document) => (
                  <Link key={document.id} href={`/documents/${document.id}`} className="grid gap-2 p-4 hover:bg-muted/60 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{document.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{document.year} · {formatBytes(document.size)} · {document.pageCount || "?"} Seiten</p>
                    </div>
                    <StatusPill status={document.indexStatus} />
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white p-5">
              <h2 className="font-semibold">Indexierungsstatus</h2>
              <div className="mt-4 space-y-3">
                {["indexed", "processing", "queued", "failed"].map((status) => {
                  const count = statusCounts.find((item) => item.indexStatus === status)?._count._all ?? 0;
                  const width = totalDocuments ? Math.max(5, Math.round((count / totalDocuments) * 100)) : 0;
                  return (
                    <div key={status}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{statusLabel(status)}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
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
