import "server-only";

import type { VersionSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CreateDocumentVersionInput = {
  documentId: string;
  checksum: string;
  size: bigint;
  storagePath: string;
  mimeType: string;
  source: VersionSource;
  authorUserId?: string;
  actorLabel?: string;
  expectedCurrentVersionId?: string;
  expectedCurrentChecksum?: string;
  preserveCurrentOnConflict?: boolean;
};

export async function createDocumentVersion(input: CreateDocumentVersionInput) {
  if (!input.authorUserId && !input.actorLabel) {
    throw new Error("Eine Version benötigt einen Benutzer oder eine Akteursbezeichnung.");
  }

  return prisma.$transaction(async (transaction) => {
    // Serializes version numbering and the current-version pointer per document.
    await transaction.$executeRawUnsafe(
      'SELECT 1 FROM "Document" WHERE "id" = $1 FOR UPDATE',
      input.documentId
    );

    const document = await transaction.document.findUnique({
      where: { id: input.documentId },
      select: { id: true, checksum: true, currentVersion: { select: { id: true, versionNumber: true } } }
    });
    if (!document) throw new Error("Dokument nicht gefunden.");

    const blob = await transaction.fileBlob.upsert({
      where: { checksum: input.checksum },
      update: {},
      create: {
        checksum: input.checksum,
        size: input.size,
        mimeType: input.mimeType,
        storagePath: input.storagePath
      }
    });

    const versionNumbers = await transaction.documentVersion.aggregate({
      where: { documentId: document.id },
      _max: { versionNumber: true }
    });
    const versionNumber = (versionNumbers._max.versionNumber ?? 0) + 1;
    const staleBase = Boolean(
      (input.expectedCurrentVersionId && input.expectedCurrentVersionId !== document.currentVersion?.id)
      || (input.expectedCurrentChecksum && input.expectedCurrentChecksum !== document.checksum)
    );
    const isConflict = Boolean(input.preserveCurrentOnConflict && staleBase);
    const version = await transaction.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber,
        blobId: blob.id,
        source: input.source,
        authorUserId: input.authorUserId ?? null,
        actorLabel: input.actorLabel ?? null,
        baseVersionId: input.expectedCurrentVersionId ?? document.currentVersion?.id ?? null,
        isConflict
      }
    });

    if (!isConflict) {
      await transaction.document.update({
        where: { id: document.id },
        data: {
          currentVersionId: version.id,
          mimeType: input.mimeType,
          size: input.size,
          checksum: input.checksum,
          storagePath: input.storagePath
        }
      });
    }

    await transaction.contentChange.create({
      data: {
        documentId: document.id,
        versionId: version.id,
        actorUserId: input.authorUserId ?? null,
        actorLabel: input.actorLabel ?? null,
        kind: input.source === "restore" ? "version_restored" : "version_created",
        details: { source: input.source, versionNumber, isConflict }
      }
    });

    return version;
  });
}
