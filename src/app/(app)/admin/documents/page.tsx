import { RefreshCw } from "lucide-react";
import { Button } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import { bulkDocumentAction, reindexDocumentAction, updateDocumentAction } from "@/server/actions/documents";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";

export default async function AdminDocumentsPage() {
  const admin = await requireAdmin();
  const householdIds = await householdIdsForUser(admin.id);
  const documents = await prisma.document.findMany({
    where: documentAccessWhere(admin.id, householdIds, true),
    orderBy: [{ year: "desc" }, { title: "asc" }]
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal">Dokumentverwaltung</h1>
        <p className="mt-1 text-sm text-muted-foreground">Eigene und für die Familie freigegebene Dokumente verwalten.</p>
      </header>

      <form action={bulkDocumentAction} className="rounded-lg border border-border bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <label className="text-xs font-medium uppercase text-muted-foreground" htmlFor="bulk-documents">Bulk-Auswahl</label>
            <select id="bulk-documents" name="documentId" multiple className="mt-1 h-32 w-full rounded-md border border-border bg-white px-3 py-2 text-sm">
              {documents.map((document) => (
                <option key={document.id} value={document.id}>{document.year} · {document.title}</option>
              ))}
            </select>
          </div>
          <label className="text-sm font-medium">
            Neues Jahr
            <input name="bulkYear" type="number" min="1900" max="2100" className="mt-1 h-10 w-full rounded-md border border-border px-3 text-sm lg:w-32" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button name="bulkAction" value="set-year" variant="secondary">Jahr setzen</Button>
            <Button name="bulkAction" value="reindex" variant="secondary">
              <RefreshCw size={16} />
              Neu indexieren
            </Button>
            <button
              formAction="/api/documents/bulk-download"
              formMethod="get"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-medium transition hover:bg-muted"
            >
              Herunterladen
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Mehrfachauswahl mit Shift oder Cmd/Strg. Bulk-Download wird als TAR-Archiv ausgeliefert.</p>
      </form>

      <div className="space-y-3">
        {documents.map((document) => (
          <article key={document.id} className="rounded-lg border border-border bg-white p-4">
            <form action={updateDocumentAction} className="grid gap-3 lg:grid-cols-[1fr_120px_auto_auto] lg:items-center">
              <input type="hidden" name="id" value={document.id} />
              <input name="title" defaultValue={document.title} className="h-10 min-w-0 rounded-md border border-border px-3 text-sm" />
              <input name="year" type="number" min="1900" max="2100" defaultValue={document.year} className="h-10 rounded-md border border-border px-3 text-sm" />
              <StatusPill status={document.indexStatus} />
              <Button variant="secondary">Speichern</Button>
            </form>
            <form action={reindexDocumentAction} className="mt-3">
              <input type="hidden" name="id" value={document.id} />
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted">
                <RefreshCw size={16} />
                Neu indexieren
              </button>
            </form>
          </article>
        ))}
      </div>
    </div>
  );
}
