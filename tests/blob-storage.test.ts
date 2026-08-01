import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { blobStoragePath, storeImmutableFile, storageLayout } from "@/server/documents/blobs";

const workDirs: string[] = [];

afterEach(async () => {
  delete process.env.PAPERVARD_DATA_PATH;
  await Promise.all(workDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("content-addressed blob storage", () => {
  it("keeps all persistent document data below PAPERVARD_DATA_PATH", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "papervard-data-"));
    workDirs.push(root);
    process.env.PAPERVARD_DATA_PATH = root;

    expect(storageLayout()).toEqual({
      root,
      blobs: path.join(root, "blobs"),
      previews: path.join(root, "previews"),
      thumbnails: path.join(root, "thumbnails"),
      staging: path.join(root, "staging"),
      library: path.join(root, "library"),
      exports: path.join(root, "exports")
    });
  });

  it("streams a file into an immutable checksum path and deduplicates identical bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "papervard-data-"));
    const sourceDirectory = await mkdtemp(path.join(tmpdir(), "papervard-source-"));
    workDirs.push(root, sourceDirectory);
    process.env.PAPERVARD_DATA_PATH = root;
    const source = path.join(sourceDirectory, "scan.bin");
    await writeFile(source, Buffer.from("large-file-fixture".repeat(1024)));

    const first = await storeImmutableFile(source);
    const second = await storeImmutableFile(source);

    expect(first.size).toBe(18_432n);
    expect(first.storagePath).toBe(blobStoragePath(first.checksum));
    expect(second).toEqual(first);
    expect(await readFile(first.storagePath, "utf8")).toBe("large-file-fixture".repeat(1024));
  });
});
