export type DocumentFamily =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "image"
  | "email"
  | "ebook"
  | "dicom"
  | "archive";

export type PreviewKind =
  | "pdf"
  | "office"
  | "converted-office"
  | "text"
  | "image"
  | "email"
  | "ebook"
  | "dicom"
  | "collection";

export type EditKind = "office" | "pdf" | "text" | "image" | "derived" | "annotation" | "none";
type SignatureKind = "pdf" | "zip" | "ole" | "dicom" | "none";

export type DocumentFormat = {
  id: string;
  label: string;
  family: DocumentFamily;
  preview: PreviewKind;
  edit: EditKind;
  extensions: readonly string[];
  mimeTypes?: readonly string[];
  signature: SignatureKind;
};

const formats: readonly DocumentFormat[] = [
  {
    id: "pdf",
    label: "PDF",
    family: "document",
    preview: "pdf",
    edit: "pdf",
    extensions: ["pdf"],
    mimeTypes: ["application/pdf"],
    signature: "pdf"
  },
  {
    id: "office-document-zip",
    label: "Office-Dokument",
    family: "document",
    preview: "office",
    edit: "office",
    extensions: ["docx", "odt"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text"
    ],
    signature: "zip"
  },
  {
    id: "legacy-document",
    label: "Legacy-Dokument",
    family: "document",
    preview: "converted-office",
    edit: "derived",
    extensions: ["doc", "rtf"],
    signature: "none"
  },
  {
    id: "apple-pages",
    label: "Apple Pages",
    family: "document",
    preview: "converted-office",
    edit: "derived",
    extensions: ["pages"],
    signature: "zip"
  },
  {
    id: "text",
    label: "Textdatei",
    family: "document",
    preview: "text",
    edit: "text",
    extensions: ["txt", "md", "markdown", "html", "htm", "tex", "json", "xml", "yaml", "yml", "toml", "sql", "ics", "vcf"],
    mimeTypes: ["text/plain", "text/markdown", "text/html", "application/json", "application/xml", "text/xml"],
    signature: "none"
  },
  {
    id: "office-spreadsheet-zip",
    label: "Office-Tabelle",
    family: "spreadsheet",
    preview: "office",
    edit: "office",
    extensions: ["xlsx", "xlsm", "ods"],
    signature: "zip"
  },
  {
    id: "legacy-spreadsheet",
    label: "Legacy-Tabelle",
    family: "spreadsheet",
    preview: "converted-office",
    edit: "derived",
    extensions: ["xls"],
    signature: "ole"
  },
  {
    id: "delimited-spreadsheet",
    label: "Texttabelle",
    family: "spreadsheet",
    preview: "office",
    edit: "office",
    extensions: ["csv", "tsv"],
    mimeTypes: ["text/csv", "text/tab-separated-values"],
    signature: "none"
  },
  {
    id: "apple-numbers",
    label: "Apple Numbers",
    family: "spreadsheet",
    preview: "converted-office",
    edit: "derived",
    extensions: ["numbers"],
    signature: "zip"
  },
  {
    id: "office-presentation-zip",
    label: "Office-Präsentation",
    family: "presentation",
    preview: "office",
    edit: "office",
    extensions: ["pptx", "odp"],
    signature: "zip"
  },
  {
    id: "legacy-presentation",
    label: "Legacy-Präsentation",
    family: "presentation",
    preview: "converted-office",
    edit: "derived",
    extensions: ["ppt"],
    signature: "ole"
  },
  {
    id: "apple-keynote",
    label: "Apple Keynote",
    family: "presentation",
    preview: "converted-office",
    edit: "derived",
    extensions: ["key", "keynote"],
    signature: "zip"
  },
  {
    id: "image",
    label: "Bild oder Scan",
    family: "image",
    preview: "image",
    edit: "image",
    extensions: [
      "jpg", "jpeg", "png", "tif", "tiff", "webp", "gif", "bmp", "heic", "heif", "avif", "svg",
      "dng", "cr2", "cr3", "nef", "arw", "orf", "rw2", "raf"
    ],
    mimeTypes: ["image/jpeg", "image/png", "image/tiff", "image/webp", "image/gif", "image/heic", "image/avif", "image/svg+xml"],
    signature: "none"
  },
  {
    id: "email",
    label: "E-Mail",
    family: "email",
    preview: "email",
    edit: "derived",
    extensions: ["eml", "mbox"],
    mimeTypes: ["message/rfc822", "application/mbox"],
    signature: "none"
  },
  {
    id: "outlook-message",
    label: "Outlook-Nachricht",
    family: "email",
    preview: "email",
    edit: "derived",
    extensions: ["msg"],
    signature: "ole"
  },
  {
    id: "ebook-zip",
    label: "E-Book",
    family: "ebook",
    preview: "ebook",
    edit: "annotation",
    extensions: ["epub"],
    mimeTypes: ["application/epub+zip"],
    signature: "zip"
  },
  {
    id: "ebook",
    label: "E-Book",
    family: "ebook",
    preview: "ebook",
    edit: "annotation",
    extensions: ["fb2", "mobi", "azw", "azw3"],
    signature: "none"
  },
  {
    id: "dicom",
    label: "DICOM",
    family: "dicom",
    preview: "dicom",
    edit: "annotation",
    extensions: ["dcm", "dicom"],
    mimeTypes: ["application/dicom"],
    signature: "dicom"
  },
  {
    id: "archive-zip",
    label: "ZIP-Sammlung",
    family: "archive",
    preview: "collection",
    edit: "none",
    extensions: ["zip"],
    mimeTypes: ["application/zip"],
    signature: "zip"
  },
  {
    id: "archive",
    label: "Archivsammlung",
    family: "archive",
    preview: "collection",
    edit: "none",
    extensions: ["tar", "gz", "tgz", "7z", "rar"],
    signature: "none"
  }
] as const;

const byExtension = new Map<string, DocumentFormat>();
const byMimeType = new Map<string, DocumentFormat>();

for (const format of formats) {
  for (const extension of format.extensions) byExtension.set(extension, format);
  for (const mimeType of format.mimeTypes ?? []) byMimeType.set(mimeType.toLowerCase(), format);
}

export function resolveDocumentFormat(fileName: string, mimeType?: string | null): DocumentFormat | null {
  const normalizedName = fileName.trim().toLowerCase();
  const extension = normalizedName.includes(".") ? normalizedName.split(".").at(-1) ?? "" : "";
  return byExtension.get(extension) ?? (mimeType ? byMimeType.get(mimeType.toLowerCase()) : undefined) ?? null;
}

export function supportedUploadExtensions() {
  return Array.from(byExtension.keys(), (extension) => `.${extension}`).sort();
}

function startsWith(buffer: Buffer, signature: readonly number[]) {
  return signature.every((byte, index) => buffer[index] === byte);
}

export function validateFormatSignature(format: DocumentFormat, header: Buffer) {
  switch (format.signature) {
    case "pdf":
      return header.subarray(0, 5).toString("ascii") === "%PDF-";
    case "zip":
      return (
        startsWith(header, [0x50, 0x4b, 0x03, 0x04]) ||
        startsWith(header, [0x50, 0x4b, 0x05, 0x06]) ||
        startsWith(header, [0x50, 0x4b, 0x07, 0x08])
      );
    case "ole":
      return startsWith(header, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "dicom":
      return header.length >= 132 && header.subarray(128, 132).toString("ascii") === "DICM";
    case "none":
      return true;
  }
}

export function allDocumentFormats() {
  return formats;
}
