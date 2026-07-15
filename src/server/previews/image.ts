import "server-only";

import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { storageLayout } from "@/server/documents/blobs";

export function imageThumbnailPath(documentId: string) {
  return path.join(storageLayout().thumbnails, `${documentId}.png`);
}

export async function createImageThumbnail(documentId: string, sourcePath: string) {
  const target = imageThumbnailPath(documentId);
  await mkdir(path.dirname(target), { recursive: true });
  await sharp(sourcePath, { failOn: "error", sequentialRead: true })
    .rotate()
    .resize({ width: 640, height: 800, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(target);
  return target;
}
