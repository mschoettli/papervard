import Link from "next/link";
import { AlertTriangle, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/button";
import { MultiPdfInput } from "@/components/multi-pdf-input";
import { StatusPill } from "@/components/status-pill";
import { reindexDocumentAction, uploadPdfAction } from "@/server/actions/documents";
import { requireAdmin } from "@/server/auth";
import { formatBytes } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";

export default async function UploadsPage() {
  const admin = await requireAdmin();
  const householdIds = await householdIdsForUser(admin.id);
  const accessWhere = documentAccessWhere(admin.id, householdIds);
  const [documents, queue, duplicateSource] = await Promise.all([
    prisma.document.findMany({
      where: accessWhere,
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.document.findMany({
      where: { AND: [accessWhere, { indexStatus: { in: ["queued", "processing", "failed"] } }] },
      orderBy: { updatedAt: "desc" },
      take: 12
    }),
    prisma.document.findMany({ where: accessWhere, select: { originalName: true }, orderBy: { createdAt: "desc" }, take: 200 })
  ]);
  const duplicateNames = Object.entries(
    duplicateSource.reduce<Record<string, number>>((counts, document) => {
      counts[document.originalName] = (counts[document.originalName] ?? 0) + 1;
      return counts;
    }, {})
  )
    .filter(([, count]) => count > 1)
    .slice(0, 5)
    .map(([name]) => name);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal">Uploads</h1>
        <p className="mt-1 text-sm text-muted-foreground">PDF hochladen, automatisch nach Jahr sortieren und lokal indexieren.</p>
      </header>

      <form action={uploadPdfAction} className="grid gap-4 rounded-lg border border-dashed border-primary/40 bg-white p-5 lg:grid-cols-[1fr_160px_220px_auto] lg:items-end">
        <MultiPdfInput id="admin-pdf-files" />
        <label className="text-sm font-medium">
          Jahr für alle optional
          <input name="year" type="number" min="1900" max="2100" placeholder="Automatisch" className="mt-1 h-10 w-full rounded-md border border-border px-3 text-sm" />
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Zugriff</legend>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="visibility" value="private" defaultChecked /> Nur ich</label>
            <label className="flex items-center gap-2"><input type="radio" name="visibility" value="family" /> Familie</label>
          </div>
        </fieldset>
        <Button>
          <Upload size={18} />
          Hochladen
        </Button>
      </form>

      {duplicateNames.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} />
            Mögliche doppelte Dateinamen
          </div>
          <p className="mt-2 text-sm">Exakte Duplikate werden per Checksum übersprungen; ähnliche Dateinamen bitte kurz prüfen.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {duplicateNames.map((name) => (
              <span key={name} className="rounded-md bg-white px-2 py-1 text-xs font-medium">{name}</span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-white">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">Indexierungswarteschlange</h2>
          <p className="mt-1 text-sm text-muted-foreground">Dokumente, die warten, laufen oder eine Nachbearbeitung brauchen.</p>
        </div>
        <div className="divide-y divide-border">
          {queue.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Keine offenen Indexierungsaufgaben.</p>
          ) : queue.map((document) => (
            <div key={document.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
              <div className="min-w-0">
                <Link href={`/documents/${document.id}`} className="truncate font-medium hover:underline">{document.title}</Link>
                <p className="mt-1 truncate text-xs text-muted-foreground">{document.indexError || `${formatBytes(document.size)} · ${document.pageCount || "?"} Seiten`}</p>
              </div>
              <StatusPill status={document.indexStatus} />
              <form action={reindexDocumentAction}>
                <input type="hidden" name="id" value={document.id} />
                <button className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted">
                  <RefreshCw size={16} />
                  Retry
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">PDF</th>
              <th className="px-4 py-3">Jahr</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Fehler</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{document.title}</td>
                <td className="px-4 py-3">{document.year}</td>
                <td className="px-4 py-3"><StatusPill status={document.indexStatus} /></td>
                <td className="max-w-[280px] truncate px-4 py-3 text-red-700">{document.indexError}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
