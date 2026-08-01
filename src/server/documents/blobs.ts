import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

export function storageLayout() {
  const root = process.env.PAPERVARD_DATA_PATH ?? path.join(process.cwd(), "data");
  return {
    root,
    blobs: path.join(root, "blobs"),
    previews: path.join(root, "previews"),
    thumbnails: path.join(root, "thumbnails"),
    staging: path.join(root, "staging"),
    library: path.join(root, "library"),
    exports: path.join(root, "exports")
  };
}

export function blobStoragePath(checksum: string) {
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error("Ungültige Blob-Prüfsumme.");
  return path.join(storageLayout().blobs, checksum.slice(0, 2), checksum.slice(2, 4), `${checksum}.blob`);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function checksumFile(sourcePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(sourcePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function storeImmutableFile(sourcePath: string) {
  const [checksum, sourceStat] = await Promise.all([checksumFile(sourcePath), stat(sourcePath)]);
  if (!sourceStat.isFile()) throw new Error("Nur reguläre Dateien können gespeichert werden.");

  const target = blobStoragePath(checksum);
  if (!(await fileExists(target))) {
    await mkdir(path.dirname(target), { recursive: true });
    const temporaryTarget = `${target}.${randomUUID()}.tmp`;
    try {
      await copyFile(sourcePath, temporaryTarget);
      await rename(temporaryTarget, target);
    } finally {
      await rm(temporaryTarget, { force: true });
    }
  }

  return {
    checksum,
    size: BigInt(sourceStat.size),
    storagePath: target
  };
}

export async function ensureStorageLayout() {
  const layout = storageLayout();
  await Promise.all(Object.values(layout).slice(1).map((directory) => mkdir(directory, { recursive: true })));
  return layout;
}
