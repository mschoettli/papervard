import "server-only";

import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { storageLayout } from "@/server/documents/blobs";
import { createImageThumbnail } from "@/server/previews/image";

const execFileAsync = promisify(execFile);

export function pdfStorageRoot() {
  return process.env.PDF_STORAGE_PATH ?? path.join(process.cwd(), "storage", "pdfs");
}

export function thumbnailRoot() {
  return storageLayout().thumbnails;
}

export function thumbnailPath(documentId: string) {
  return path.join(thumbnailRoot(), `${documentId}.png`);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function createDocumentThumbnail(documentId: string, pdfPath: string) {
  const target = thumbnailPath(documentId);
  await mkdir(thumbnailRoot(), { recursive: true });

  const workDir = await mkdtemp(path.join(tmpdir(), "papervard-thumb-"));
  const outputPrefix = path.join(workDir, "page");
  const renderedPath = `${outputPrefix}.png`;

  try {
    await execFileAsync("pdftoppm", ["-f", "1", "-singlefile", "-r", "120", "-png", pdfPath, outputPrefix], { timeout: 120000 });
    await copyFile(renderedPath, target);
    return target;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function ensureDocumentThumbnail(documentId: string, pdfPath: string) {
  const target = thumbnailPath(documentId);
  if (await fileExists(target)) return target;
  return createDocumentThumbnail(documentId, pdfPath);
}

export async function readOrCreateDocumentThumbnail(documentId: string, sourcePath: string, family: string = "document") {
  const target = thumbnailPath(documentId);
  const filePath = await fileExists(target)
    ? target
    : family === "image"
      ? await createImageThumbnail(documentId, sourcePath)
      : await createDocumentThumbnail(documentId, sourcePath);
  return readFile(filePath);
}
