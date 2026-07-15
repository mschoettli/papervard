import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ImageDocumentEditor } from "@/components/image-document-editor";
import { OnlyOfficeEditor } from "@/components/onlyoffice-editor";
import { TextDocumentEditor } from "@/components/text-document-editor";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";
import { isImageEditable, isTextEditable } from "@/server/editing/versions";
import { createOnlyOfficeConfig } from "@/server/office/config";
import { isOnlyOfficeEditable } from "@/server/office/config";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const householdIds = await householdIdsForUser(user.id);
  const document = await prisma.document.findFirst({
    where: { id, ...documentAccessWhere(user.id, householdIds, user.role === "admin") },
    include: { currentVersion: { select: { id: true, versionNumber: true } } }
  });
  if (!document) notFound();

  const officeEditable = isOnlyOfficeEditable(document);
  const textEditable = isTextEditable(document);
  const imageEditable = document.family === "image" && isImageEditable(document);
  if (!officeEditable && !textEditable && !imageEditable) notFound();
  return (
    <div className="mx-auto max-w-screen-2xl space-y-4">
      <Link href={`/documents/${document.id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" size={17} /> Zurück zu {document.title}
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">{document.title} bearbeiten</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {officeEditable
            ? "Änderungen werden in Echtzeit gemeinsam bearbeitet und als neue Inhaltsversion gespeichert."
            : "Änderungen werden lokal verarbeitet und als neue Inhaltsversion gespeichert; das Original bleibt wiederherstellbar."}
        </p>
      </header>
      {officeEditable ? (
        <OnlyOfficeEditor
          serverUrl={process.env.NEXT_PUBLIC_ONLYOFFICE_URL ?? "http://localhost:8081"}
          config={createOnlyOfficeConfig(document, { id: user.id, name: user.name })}
        />
      ) : textEditable ? (
        <TextDocumentEditor documentId={document.id} title={document.title} baseVersionId={document.currentVersion!.id} />
      ) : (
        <ImageDocumentEditor documentId={document.id} title={document.title} baseVersionId={document.currentVersion!.id} />
      )}
    </div>
  );
}
