import { Upload } from "lucide-react";
import { Button } from "@/components/button";
import { StatusPill } from "@/components/status-pill";
import { uploadPdfAction } from "@/server/actions/documents";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/lib/prisma";

export default async function UploadsPage() {
  await requireAdmin();
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    take: 20
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal">Uploads</h1>
        <p className="mt-1 text-sm text-muted-foreground">PDF hochladen, automatisch nach Jahr sortieren und lokal indexieren.</p>
      </header>
      <form action={uploadPdfAction} className="grid gap-4 rounded-lg border border-border bg-white p-4 sm:grid-cols-[1fr_140px_auto]">
        <input name="file" type="file" accept="application/pdf" required className="min-w-0 rounded-md border border-border bg-white px-3 py-2 text-sm" />
        <input name="year" type="number" min="1900" max="2100" placeholder="Jahr optional" className="h-10 rounded-md border border-border px-3 text-sm" />
        <Button>
          <Upload size={18} />
          Hochladen
        </Button>
      </form>
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
