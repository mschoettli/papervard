import { notFound } from "next/navigation";
import { DicomViewer } from "@/components/dicom-viewer";
import { prisma } from "@/lib/prisma";
import { updateDicomSeriesTagsAction } from "@/server/actions/library";
import { requireUser } from "@/server/auth";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";
import { decryptSensitiveField } from "@/server/security/field-encryption";

export default async function DicomDocumentPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ series?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const requested = await searchParams;
  const householdIds = await householdIdsForUser(user.id);
  const document = await prisma.document.findFirst({
    where: { id, family: "dicom", ...documentAccessWhere(user.id, householdIds, user.role === "admin") },
    include: {
      dicomStudy: {
        include: { series: { include: { instances: { orderBy: { instanceNumber: "asc" } }, tags: { include: { tag: true } } }, orderBy: { seriesNumber: "asc" } } }
      }
    }
  });
  if (!document?.dicomStudy || document.dicomStudy.series.length === 0) notFound();
  const study = document.dicomStudy;
  const context = study.studyInstanceUid;
  const selectedSeries = study.series.find((series) => series.id === requested.series) ?? study.series[0];
  const tags = await prisma.tag.findMany({ where: { householdId: document.householdId }, orderBy: { name: "asc" } });

  return (
    <div className="space-y-3">
      <header className="grid gap-2 rounded-lg border border-border bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <DicomInfo label="Patient" value={decryptSensitiveField(study.patientNameCiphertext, `${context}:patient-name`) ?? "–"} />
        <DicomInfo label="Geburtsdatum" value={decryptSensitiveField(study.patientBirthDateCiphertext, `${context}:patient-birth-date`) ?? "–"} />
        <DicomInfo label="Patient-ID" value={decryptSensitiveField(study.patientIdCiphertext, `${context}:patient-id`) ?? "–"} />
        <DicomInfo label="Serie" value={`${selectedSeries.modality ?? "DICOM"} · ${selectedSeries.instances.length} Bilder`} />
      </header>
      {study.series.length > 1 ? (
        <form method="get" className="flex flex-col gap-2 rounded-lg border border-border bg-white p-4 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium" htmlFor="dicom-series">
            DICOM-Serie
            <select id="dicom-series" name="series" defaultValue={selectedSeries.id} className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3">
              {study.series.map((series) => (
                <option key={series.id} value={series.id}>
                  {series.seriesNumber ?? "–"} · {series.modality ?? "DICOM"} · {series.description ?? "Ohne Beschreibung"} · {series.instances.length} Bilder
                </option>
              ))}
            </select>
          </label>
          <button className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Serie anzeigen</button>
        </form>
      ) : null}
      <form action={updateDicomSeriesTagsAction} className="rounded-lg border border-border bg-white p-4">
        <input type="hidden" name="seriesId" value={selectedSeries.id} />
        <fieldset><legend className="text-sm font-semibold">Tags dieser DICOM-Serie</legend><div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => <label key={tag.id} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3 text-sm"><input type="checkbox" name="tagId" value={tag.id} defaultChecked={selectedSeries.tags.some((item) => item.tagId === tag.id)} /><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />{tag.name}</label>)}
        </div></fieldset><button className="mt-3 min-h-11 rounded-md bg-muted px-4 text-sm font-medium">Serien-Tags speichern</button>
      </form>
      <DicomViewer key={selectedSeries.id} documentId={document.id} seriesId={selectedSeries.id} instanceIds={selectedSeries.instances.map((instance) => instance.id)} />
      <p className="text-xs text-muted-foreground">Medizinische Vorschau – kein Ersatz für ein diagnostisch zertifiziertes Befundsystem. Annotationen verändern niemals die Originalpixel.</p>
    </div>
  );
}

function DicomInfo({ label, value }: { label: string; value: string }) {
  return <div><span className="block text-xs text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}
