import "server-only";

import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { SmbSyncEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checksumFile, storageLayout, storeImmutableFile } from "@/server/documents/blobs";
import { resolveDocumentFormat, validateFormatSignature } from "@/server/documents/formats";
import { createDocumentVersion } from "@/server/documents/versions";
import { ensureUnsortedFolder } from "@/server/documents/folders";
import { detectYear } from "@/server/pdf/year";
import { memberDirectoryName, parseSmbPath, resolveInsideLibrary, safePathSegment } from "@/server/smb/paths";

const STABILITY_MS = 2500;
let reconciliationRunning = false;

type SmbEntryRef = Pick<SmbSyncEntry, "id" | "documentId" | "lastChecksum">;

export async function applySmbModification(entry: SmbEntryRef, filePath: string, mimeType: string) {
  if (!entry.documentId) return false;
  const checksum = await checksumFile(filePath);
  if (checksum === entry.lastChecksum) return false;
  const blob = await storeImmutableFile(filePath);
  const version = await createDocumentVersion({
    documentId: entry.documentId,
    checksum: blob.checksum,
    size: blob.size,
    storagePath: blob.storagePath,
    mimeType,
    source: "smb",
    actorLabel: "SMB-Administrator",
    expectedCurrentChecksum: entry.lastChecksum ?? undefined,
    preserveCurrentOnConflict: true
  });
  await prisma.smbSyncEntry.update({
    where: { id: entry.id },
    data: {
      lastChecksum: blob.checksum,
      lastSize: blob.size,
      lastModifiedAt: new Date(),
      syncState: "synced"
    }
  });
  if (!version.isConflict) await prisma.processingJob.createMany({
    data: [
      { type: "extract", documentId: entry.documentId, versionId: version.id, stage: "queued" },
      { type: "preview", documentId: entry.documentId, versionId: version.id, stage: "queued" }
    ]
  });
  return true;
}

async function walkFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("~$")) continue;
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, fullPath));
    else if (entry.isFile() && !(await lstat(fullPath)).isSymbolicLink()) files.push(path.relative(root, fullPath));
  }
  return files;
}

function titleFromFileName(fileName: string) {
  const extension = path.extname(fileName);
  return (extension ? fileName.slice(0, -extension.length) : fileName).replace(/[_-]+/g, " ").trim() || fileName;
}

async function validateFile(filePath: string, fileName: string, mimeType: string) {
  const format = resolveDocumentFormat(fileName, mimeType);
  if (!format) throw new Error(`SMB-Dateiformat von ${fileName} wird nicht unterstützt.`);
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (!validateFormatSignature(format, header.subarray(0, bytesRead))) {
      throw new Error(`Dateisignatur von ${fileName} ist ungültig.`);
    }
  } finally {
    await handle.close();
  }
  return format;
}

async function ensureSmbFolder(input: {
  householdId: string;
  ownerUserId: string;
  visibility: "private" | "family";
  segments: string[];
}) {
  if (input.segments.length === 0) {
    return ensureUnsortedFolder({
      userId: input.ownerUserId,
      householdId: input.householdId,
      visibility: input.visibility
    });
  }
  let parentId: string | null = null;
  let folder: { id: string } | null = null;
  for (const rawName of input.segments) {
    const name = safePathSegment(rawName);
    folder = await prisma.folder.findFirst({
      where: {
        name,
        householdId: input.householdId,
        visibility: input.visibility,
        parentId,
        deletedAt: null,
        ...(input.visibility === "private" ? { createdByUserId: input.ownerUserId } : {})
      },
      select: { id: true }
    });
    if (!folder) {
      folder = await prisma.folder.create({
        data: {
          name,
          householdId: input.householdId,
          visibility: input.visibility,
          createdByUserId: input.ownerUserId,
          parentId
        },
        select: { id: true }
      });
    }
    parentId = folder.id;
  }
  return folder!;
}

type MemberTarget = { userId: string; householdId: string; directory: string };

async function importNewSmbFile(relativePath: string, filePath: string, target: MemberTarget, parsed: NonNullable<ReturnType<typeof parseSmbPath>>) {
  const format = resolveDocumentFormat(parsed.fileName);
  const mimeType = format?.mimeTypes?.[0] ?? "application/octet-stream";
  const verifiedFormat = await validateFile(filePath, parsed.fileName, mimeType);
  const folder = await ensureSmbFolder({
    householdId: target.householdId,
    ownerUserId: target.userId,
    visibility: parsed.visibility,
    segments: parsed.folderSegments
  });
  const blob = await storeImmutableFile(filePath);
  let document = await prisma.document.findFirst({ where: { ownerUserId: target.userId, checksum: blob.checksum } });
  if (!document) {
    document = await prisma.document.create({
      data: {
        title: titleFromFileName(parsed.fileName),
        originalName: parsed.fileName,
        year: detectYear(parsed.fileName),
        family: verifiedFormat.family,
        format: verifiedFormat.id,
        mimeType,
        size: blob.size,
        storagePath: blob.storagePath,
        checksum: blob.checksum,
        ownerUserId: target.userId,
        householdId: target.householdId,
        visibility: parsed.visibility,
        folderId: folder.id,
        indexStatus: "queued"
      }
    });
    const version = await createDocumentVersion({
      documentId: document.id,
      checksum: blob.checksum,
      size: blob.size,
      storagePath: blob.storagePath,
      mimeType,
      source: "smb",
      actorLabel: "SMB-Administrator"
    });
    await prisma.processingJob.createMany({ data: [
      { type: "extract", documentId: document.id, versionId: version.id, stage: "queued" },
      { type: "preview", documentId: document.id, versionId: version.id, stage: "queued" }
    ] });
  }
  const fileStat = await stat(filePath);
  await prisma.smbSyncEntry.upsert({
    where: { documentId: document.id },
    update: { relativePath, lastChecksum: blob.checksum, lastSize: blob.size, lastModifiedAt: fileStat.mtime, syncState: "synced" },
    create: { relativePath, documentId: document.id, entryType: "document", lastChecksum: blob.checksum, lastSize: blob.size, lastModifiedAt: fileStat.mtime }
  });
}

async function tryApplySmbMove(
  relativePath: string,
  filePath: string,
  target: MemberTarget,
  parsed: NonNullable<ReturnType<typeof parseSmbPath>>,
  entries: SmbSyncEntry[],
  libraryRoot: string
) {
  const checksum = await checksumFile(filePath);
  for (const entry of entries) {
    if (!entry.documentId || entry.lastChecksum !== checksum) continue;
    const oldPath = resolveInsideLibrary(libraryRoot, entry.relativePath);
    if (await stat(oldPath).then(() => true, () => false)) continue;
    const document = await prisma.document.findUnique({ where: { id: entry.documentId } });
    if (!document) continue;
    const folder = await ensureSmbFolder({
      householdId: target.householdId,
      ownerUserId: target.userId,
      visibility: parsed.visibility,
      segments: parsed.folderSegments
    });
    await prisma.$transaction([
      prisma.document.update({
        where: { id: document.id },
        data: {
          ownerUserId: target.userId,
          householdId: target.householdId,
          visibility: parsed.visibility,
          folderId: folder.id,
          originalName: parsed.fileName,
          title: titleFromFileName(parsed.fileName)
        }
      }),
      prisma.contentChange.create({
        data: {
          documentId: document.id,
          actorLabel: "SMB-Administrator",
          kind: "ownership_transferred",
          details: {
            fromOwnerUserId: document.ownerUserId,
            toOwnerUserId: target.userId,
            fromVisibility: document.visibility,
            toVisibility: parsed.visibility,
            relativePath
          }
        }
      }),
      prisma.smbSyncEntry.update({
        where: { id: entry.id },
        data: { relativePath, lastModifiedAt: new Date(), syncState: "synced" }
      })
    ]);
    return entry.id;
  }
  return null;
}

function folderSegments(folderId: string, folders: Map<string, { id: string; name: string; parentId: string | null }>) {
  const segments: string[] = [];
  const visited = new Set<string>();
  let current = folders.get(folderId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    segments.unshift(safePathSegment(current.name));
    current = current.parentId ? folders.get(current.parentId) : undefined;
  }
  return segments;
}

async function atomicCopy(source: string, target: string) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.papervard-tmp`;
  try {
    await copyFile(source, temporary);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function reconcileSmbLibrary() {
  if (reconciliationRunning) return;
  reconciliationRunning = true;
  const libraryRoot = storageLayout().library;
  try {
    await mkdir(path.join(libraryRoot, "Familie"), { recursive: true });
    await mkdir(path.join(libraryRoot, "Privat"), { recursive: true });
    const memberships = await prisma.householdMember.findMany({
      where: { user: { active: true } },
      include: { user: { select: { id: true, name: true } } }
    });
    const baseNames = memberships.map((membership) => memberDirectoryName(membership.user));
    const members: MemberTarget[] = memberships.map((membership, index) => ({
      userId: membership.userId,
      householdId: membership.householdId,
      directory: baseNames.filter((name) => name === baseNames[index]).length > 1
        ? `${baseNames[index]} (${membership.userId.slice(0, 8)})`
        : baseNames[index]
    }));
    for (const member of members) {
      await mkdir(path.join(libraryRoot, "Familie", member.directory), { recursive: true });
      await mkdir(path.join(libraryRoot, "Privat", member.directory), { recursive: true });
    }

    const relativeFiles = await walkFiles(libraryRoot);
    const entries = await prisma.smbSyncEntry.findMany({ where: { entryType: "document" } });
    const byPath = new Map(entries.map((entry) => [entry.relativePath, entry]));
    const seenEntries = new Set<string>();

    for (const relativePath of relativeFiles) {
      const parsed = parseSmbPath(relativePath);
      if (!parsed) continue;
      const target = members.find((member) => member.directory === parsed.memberDirectory);
      if (!target) continue;
      const filePath = resolveInsideLibrary(libraryRoot, relativePath);
      const fileStat = await stat(filePath);
      if (Date.now() - fileStat.mtimeMs < STABILITY_MS) continue;
      const entry = byPath.get(relativePath);
      if (entry) {
        seenEntries.add(entry.id);
        const document = entry.documentId ? await prisma.document.findUnique({ where: { id: entry.documentId }, select: { mimeType: true } }) : null;
        if (document) await applySmbModification(entry, filePath, document.mimeType);
      } else {
        const movedEntryId = await tryApplySmbMove(relativePath, filePath, target, parsed, entries, libraryRoot);
        if (movedEntryId) seenEntries.add(movedEntryId);
        else await importNewSmbFile(relativePath, filePath, target, parsed);
      }
    }

    for (const entry of entries) {
      if (seenEntries.has(entry.id) || !entry.documentId) continue;
      const currentEntry = await prisma.smbSyncEntry.findUnique({ where: { id: entry.id } });
      if (!currentEntry || currentEntry.relativePath !== entry.relativePath) continue;
      const filePath = resolveInsideLibrary(libraryRoot, entry.relativePath);
      const exists = await stat(filePath).then(() => true, () => false);
      if (!exists) {
        const document = await prisma.document.findUnique({ where: { id: entry.documentId }, select: { folderId: true } });
        if (document) await prisma.document.update({ where: { id: entry.documentId }, data: { deletedAt: new Date(), deletedFromFolderId: document.folderId } });
        await prisma.smbSyncEntry.delete({ where: { id: entry.id } });
      }
    }

    const [foldersList, documents] = await Promise.all([
      prisma.folder.findMany({ where: { deletedAt: null }, select: { id: true, name: true, parentId: true } }),
      prisma.document.findMany({ where: { deletedAt: null }, select: { id: true, ownerUserId: true, visibility: true, folderId: true, originalName: true, storagePath: true, checksum: true, size: true } })
    ]);
    const folders = new Map(foldersList.map((folder) => [folder.id, folder]));
    for (const document of documents) {
      const member = members.find((candidate) => candidate.userId === document.ownerUserId);
      if (!member) continue;
      const relativePath = path.join(
        document.visibility === "family" ? "Familie" : "Privat",
        member.directory,
        ...folderSegments(document.folderId, folders),
        safePathSegment(document.originalName)
      );
      const target = resolveInsideLibrary(libraryRoot, relativePath);
      const entry = await prisma.smbSyncEntry.findUnique({ where: { documentId: document.id } });
      if (!entry || entry.relativePath !== relativePath || entry.lastChecksum !== document.checksum) {
        await atomicCopy(document.storagePath, target);
        if (entry?.relativePath && entry.relativePath !== relativePath) {
          await rm(resolveInsideLibrary(libraryRoot, entry.relativePath), { force: true });
        }
        await prisma.smbSyncEntry.upsert({
          where: { documentId: document.id },
          update: { relativePath, lastChecksum: document.checksum, lastSize: document.size, lastModifiedAt: new Date(), syncState: "synced" },
          create: { relativePath, documentId: document.id, entryType: "document", lastChecksum: document.checksum, lastSize: document.size, lastModifiedAt: new Date() }
        });
      }
    }
  } finally {
    reconciliationRunning = false;
  }
}
