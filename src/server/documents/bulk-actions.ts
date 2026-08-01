import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { householdIdsForUser } from "@/server/documents/access";
import { normalizeDocumentSelection, resolveDocumentSelection, type DocumentSelection } from "@/server/documents/bulk-selection";
import { folderAccessWhere } from "@/server/documents/folders";

export type MovableDocument = {
  id: string;
  visibility: "private" | "family";
  householdId: string;
  ownerUserId: string;
};

export type MoveTarget = {
  id: string;
  visibility: "private" | "family";
  householdId: string;
  createdByUserId: string;
};

export function compatibleDocumentIdsForMove(documents: MovableDocument[], target: MoveTarget) {
  const visibilities = new Set(documents.map((document) => document.visibility));
  if (visibilities.size > 1) {
    throw new Error("Dokumente aus privaten und gemeinsamen Bereichen können nicht gemeinsam verschoben werden.");
  }
  return documents
    .filter((document) => document.visibility === target.visibility)
    .filter((document) => document.householdId === target.householdId)
    .filter((document) => document.visibility === "family" || document.ownerUserId === target.createdByUserId)
    .map((document) => document.id);
}

export type BulkDocumentRequest =
  | { action: "move"; selection: DocumentSelection; targetFolderId: string }
  | { action: "add-tags" | "remove-tags"; selection: DocumentSelection; tagIds: string[] }
  | { action: "trash"; selection: DocumentSelection };

export function normalizeBulkDocumentRequest(input: unknown): BulkDocumentRequest {
  const object = z.object({ action: z.enum(["move", "add-tags", "remove-tags", "trash"]), selection: z.unknown() }).passthrough().parse(input);
  const selection = normalizeDocumentSelection(object.selection);
  if (object.action === "move") {
    return {
      action: "move",
      selection,
      targetFolderId: z.string().min(1).parse(object.targetFolderId)
    };
  }
  if (object.action === "add-tags" || object.action === "remove-tags") {
    const tagIds = [...new Set(z.array(z.string().min(1)).min(1).max(100).parse(object.tagIds))];
    return { action: object.action, selection, tagIds };
  }
  return { action: "trash", selection };
}

export async function applyDocumentBulkOperation(user: Pick<User, "id" | "role">, input: unknown) {
  const request = normalizeBulkDocumentRequest(input);
  const documents = await resolveDocumentSelection(user, request.selection);
  if (documents.length === 0) return { total: 0, processed: 0, skipped: 0 };

  if (request.action === "move") {
    const householdIds = await householdIdsForUser(user.id);
    const target = await prisma.folder.findFirst({
      where: { id: request.targetFolderId, ...folderAccessWhere(user.id, householdIds, user.role === "admin") },
      select: { id: true, visibility: true, householdId: true, createdByUserId: true }
    });
    if (!target) throw new Error("Zielordner nicht gefunden.");
    const ids = compatibleDocumentIdsForMove(documents, target);
    const updated = await prisma.document.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { folderId: target.id }
    });
    return result(documents.length, updated.count);
  }

  if (request.action === "trash") {
    let processed = 0;
    const deletedAt = new Date();
    for (const batch of chunks(documents, 100)) {
      const updates = await prisma.$transaction(batch.map((document) => prisma.document.updateMany({
        where: { id: document.id, deletedAt: null },
        data: { deletedAt, deletedFromFolderId: document.folderId }
      })));
      processed += updates.reduce((sum, update) => sum + update.count, 0);
    }
    return result(documents.length, processed);
  }

  const householdIds = [...new Set(documents.map((document) => document.householdId))];
  const tags = await prisma.tag.findMany({
    where: { id: { in: request.tagIds }, householdId: { in: householdIds } },
    select: { id: true, householdId: true }
  });
  if (tags.length !== request.tagIds.length) throw new Error("Mindestens ein Tag ist nicht verfügbar.");

  if (request.action === "remove-tags") {
    await prisma.documentTag.deleteMany({
      where: { documentId: { in: documents.map((document) => document.id) }, tagId: { in: tags.map((tag) => tag.id) } }
    });
    return result(documents.length, documents.length);
  }

  const assignments = documents.flatMap((document) => tags
    .filter((tag) => tag.householdId === document.householdId)
    .map((tag) => ({ documentId: document.id, tagId: tag.id, assignedByUserId: user.id })));
  for (const batch of chunks(assignments, 1000)) {
    await prisma.documentTag.createMany({ data: batch, skipDuplicates: true });
  }
  const processedIds = new Set(assignments.map((assignment) => assignment.documentId));
  return result(documents.length, processedIds.size);
}

function result(total: number, processed: number) {
  return { total, processed, skipped: Math.max(0, total - processed) };
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}
