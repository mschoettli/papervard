import Link from "next/link";
import { Archive, BookOpen, FilePenLine, FileText, Mail } from "lucide-react";

type DocumentPreviewProps = {
  id: string;
  title: string;
  family: "document" | "spreadsheet" | "presentation" | "image" | "email" | "ebook" | "dicom" | "archive";
  format: string;
  mimeType: string;
  extractedText: string;
  canEdit: boolean;
  page?: number;
};

export function DocumentPreview(props: DocumentPreviewProps) {
  const source = `/api/documents/${props.id}/file`;
  if (props.family === "image" && props.mimeType !== "image/svg+xml") {
    return <div className="flex min-h-[60vh] items-center justify-center bg-neutral-950 p-3"><img src={source} alt={props.title} className="max-h-[78vh] max-w-full object-contain" /></div>;
  }
  if (props.format === "pdf") {
    return <iframe title={`PDF: ${props.title}`} src={`${source}${props.page ? `#page=${props.page}` : ""}`} className="h-[72vh] min-h-[560px] w-full bg-white" />;
  }
  if (props.family === "dicom") {
    return <iframe title={`DICOM: ${props.title}`} src={`/documents/${props.id}/dicom`} className="h-[76vh] min-h-[620px] w-full bg-black" />;
  }

  const icon = props.family === "email" ? <Mail aria-hidden="true" size={28} />
    : props.family === "ebook" ? <BookOpen aria-hidden="true" size={28} />
      : props.family === "archive" ? <Archive aria-hidden="true" size={28} />
        : <FileText aria-hidden="true" size={28} />;
  return (
    <div className="min-h-[60vh] bg-white p-5 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3 text-muted-foreground">{icon}<span className="text-sm font-medium">Lokale Vorschau</span></div>
        {props.canEdit ? (
          <Link href={`/documents/${props.id}/edit`} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            <FilePenLine aria-hidden="true" size={18} /> Im lokalen Editor öffnen
          </Link>
        ) : null}
        <pre className="mt-6 whitespace-pre-wrap break-words rounded-md bg-muted p-4 font-sans text-sm leading-7">
          {props.extractedText || "Die Vorschau wird lokal vorbereitet. Das Original kann bereits heruntergeladen werden."}
        </pre>
      </div>
    </div>
  );
}
