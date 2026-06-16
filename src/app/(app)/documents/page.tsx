import Link from "next/link";
import { Download, Eye, Search } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { formatBytes } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

export default async function DocumentsPage({
  searchParams
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const selectedYear = params.year ? Number(params.year) : undefined;
  const years = await prisma.document.findMany({
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" }
  });
  const documents = await prisma.document.findMany({
    where: selectedYear ? { year: selectedYear } : undefined,
    orderBy: [{ year: "desc" }, { title: "asc" }]
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

      <form className="flex max-w-xs items-center gap-2">
        <label htmlFor="year" className="text-sm font-medium">
          Jahr
        </label>
        <select id="year" name="year" defaultValue={selectedYear ?? ""} className="h-10 flex-1 rounded-md border border-border bg-white px-3">
          <option value="">Alle Jahre</option>
          {years.map((item) => (
            <option key={item.year} value={item.year}>
              {item.year}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-md border border-border bg-white px-3 text-sm">Filtern</button>
      </form>

      {documents.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
          <h2 className="text-lg font-semibold">Keine PDFs vorhanden</h2>
          <p className="mt-2 text-sm text-muted-foreground">Admins können unter Uploads neue Dokumente hinzufügen.</p>
        </section>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
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
                  <td className="max-w-[360px] px-4 py-3 font-medium">{document.title}</td>
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
      )}
    </div>
  );
}
