import path from "node:path";

type FolderNode = { id: string; name: string; parentId: string | null };
type ExportDocument = { id: string; folderId: string; year: number; title: string; originalName: string };

export function buildDocumentExportPaths(folders: FolderNode[], documents: ExportDocument[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const used = new Set<string>();
  return documents.map((document) => {
    const folderSegments = folderPath(byId, document.folderId).map((segment) => safeArchiveSegment(segment));
    const extension = safeExtension(document.originalName);
    const baseName = safeArchiveSegment(`${document.year}-${document.title}`) || `${document.year}-${document.id}`;
    const directory = ["Papervard-Export", ...folderSegments].join("/");
    let relativePath = `${directory}/${baseName}${extension}`;
    let suffix = 2;
    while (used.has(relativePath.toLocaleLowerCase("de-CH"))) {
      relativePath = `${directory}/${baseName}-${suffix}${extension}`;
      suffix += 1;
    }
    used.add(relativePath.toLocaleLowerCase("de-CH"));
    return { documentId: document.id, relativePath };
  });
}

function folderPath(byId: Map<string, FolderNode>, folderId: string) {
  const result: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    result.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return result;
}

function safeArchiveSegment(value: string) {
  return value
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 96);
}

function safeExtension(originalName: string) {
  const extension = path.extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : "";
}
