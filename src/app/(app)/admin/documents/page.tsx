import { RefreshCw } from "lucide-react";
import { Button } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import { reindexDocumentAction, updateDocumentAction } from "@/server/actions/documents";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminDocumentsPage() {
  await requireAdmin();
  const documents = await prisma.document.findMany({
    orderBy: [{ year: "desc" }, { title: "asc" }]
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal">Dokumentverwaltung</h1>
        <p className="mt-1 text-sm text-muted-foreground">Titel, Jahr und Indexierung verwalten.</p>
      </header>
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
