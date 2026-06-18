import Link from "next/link";
import { Download, Eye, Heart, Search, SlidersHorizontal } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { formatBytes, statusLabel } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { prisma } from "@/lib/prisma";

export default async function DocumentsPage({
  searchParams
}: {
  searchParams: Promise<{ year?: string; status?: string; sort?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const selectedYear = params.year ? Number(params.year) : undefined;
  const selectedStatus = ["queued", "processing", "indexed", "failed"].includes(params.status ?? "") ? params.status : undefined;
  const sort = params.sort ?? "newest";
  const years = await prisma.document.findMany({
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" }
  });
  const statusCounts = await prisma.document.groupBy({ by: ["indexStatus"], _count: { _all: true } });
  const documents = await prisma.document.findMany({
    where: {
      ...(selectedYear ? { year: selectedYear } : {}),
      ...(selectedStatus ? { indexStatus: selectedStatus as "queued" | "processing" | "indexed" | "failed" } : {})
    },
    include: { favorites: { where: { userId: user.id }, select: { id: true } } },
    orderBy: sort === "title" ? [{ title: "asc" }] : sort === "year" ? [{ year: "desc" }, { title: "asc" }] : [{ createdAt: "desc" }]
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Dokumente</h1>
          <p className="mt-1 text-sm text-muted-foreground">PDFs nach Jahr filtern, ansehen und herunterladen.</p>
        </div>
        <Link
          href="/search"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          <Search size={18} />
          Suche öffnen
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {["indexed", "processing", "queued", "failed"].map((status) => (
          <div key={status} className="rounded-lg border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">{statusLabel(status)}</p>
            <p className="mt-2 text-2xl font-semibold">{statusCounts.find((item) => item.indexStatus === status)?._count._all ?? 0}</p>
          </div>
        ))}
      </section>

      <form className="grid gap-3 rounded-lg border border-border bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
        <div>
          <label htmlFor="year" className="text-xs font-medium uppercase text-muted-foreground">Jahr</label>
          <select id="year" name="year" defaultValue={selectedYear ?? ""} className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3">
            <option value="">Alle Jahre</option>
            {years.map((item) => (
              <option key={item.year} value={item.year}>{item.year}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="text-xs font-medium uppercase text-muted-foreground">Status</label>
          <select id="status" name="status" defaultValue={selectedStatus ?? ""} className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3">
            <option value="">Alle Status</option>
            <option value="indexed">Bereit</option>
            <option value="processing">Indexiert</option>
            <option value="queued">Wartet</option>
            <option value="failed">Fehler</option>
          </select>
        </div>
        <div>
          <label htmlFor="sort" className="text-xs font-medium uppercase text-muted-foreground">Sortierung</label>
          <select id="sort" name="sort" defaultValue={sort} className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3">
            <option value="newest">Neueste zuerst</option>
            <option value="year">Jahr</option>
            <option value="title">Titel</option>
          </select>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md border border-border bg-white px-4 text-sm font-medium hover:bg-muted">
          <SlidersHorizontal size={17} />
          Filtern
        </button>
      </form>

      {documents.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
          <h2 className="text-lg font-semibold">Keine PDFs vorhanden</h2>
          <p className="mt-2 text-sm text-muted-foreground">Admins können unter Uploads neue Dokumente hinzufügen.</p>
        </section>
      ) : (
        <>
        <div className="hidden overflow-hidden rounded-lg border border-border bg-white md:block">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Titel</th>
                <th className="px-4 py-3">Jahr</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Größe</th>
                <th className="px-4 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id} className="border-t border-border">
                  <td className="max-w-[360px] px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {document.favorites.length > 0 ? <Heart size={15} className="fill-red-500 text-red-500" /> : null}
                      <span className="truncate">{document.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{document.year}</td>
                  <td className="px-4 py-3"><StatusPill status={document.indexStatus} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{formatBytes(document.size)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link title="Ansehen" href={`/documents/${document.id}`} className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted">
                        <Eye size={17} />
                      </Link>
                      <a title="Herunterladen" href={`/api/documents/${document.id}/download`} className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted">
                        <Download size={17} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:hidden">
          {documents.map((document) => (
            <article key={document.id} className="rounded-lg border border-border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{document.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{document.year} · {formatBytes(document.size)}</p>
                </div>
                {document.favorites.length > 0 ? <Heart size={18} className="shrink-0 fill-red-500 text-red-500" /> : null}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <StatusPill status={document.indexStatus} />
                <div className="flex gap-2">
                  <Link title="Ansehen" href={`/documents/${document.id}`} className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted">
                    <Eye size={17} />
                  </Link>
                  <a title="Herunterladen" href={`/api/documents/${document.id}/download`} className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted">
                    <Download size={17} />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
