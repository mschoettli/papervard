import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/status-pill";
import { formatBytes } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) notFound();

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
        <a href={`/api/documents/${document.id}/download`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          <Download size={18} />
          Download
        </a>
      </header>
      {document.indexError ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{document.indexError}</p> : null}
      <iframe
        title={document.title}
        src={`/api/documents/${document.id}/file`}
        className="h-[72vh] w-full rounded-lg border border-border bg-white"
      />
    </div>
  );
}
