import path from "node:path";

export function safePathSegment(value: string) {
  const cleaned = value
    .normalize("NFC")
    .replace(/\.\./g, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 120);
  return cleaned || "Unbenannt";
}

export function memberDirectoryName(member: { id: string; name: string }) {
  return safePathSegment(member.name || `Mitglied ${member.id.slice(0, 8)}`);
}

export function parseSmbPath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const rawSegments = normalized.split("/");
  if (rawSegments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  if (rawSegments.length < 3) return null;

  const [root, memberDirectory, ...tail] = rawSegments;
  const visibility = root === "Familie" ? "family" : root === "Privat" ? "private" : null;
  if (!visibility || !memberDirectory) return null;
  const fileName = tail.at(-1);
  if (!fileName) return null;
  return {
    visibility,
    memberDirectory,
    folderSegments: tail.slice(0, -1),
    fileName
  } as const;
}

export function resolveInsideLibrary(libraryRoot: string, relativePath: string) {
  const resolvedRoot = path.resolve(libraryRoot);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("SMB-Pfad verlässt die Bibliothek.");
  }
  return resolved;
}
