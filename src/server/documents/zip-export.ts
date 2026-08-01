import "server-only";

import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import archiver from "archiver";

export type ZipExportItem = {
  id: string;
  sourcePath: string;
  relativePath: string;
  size: bigint;
};

export async function writeZipArchive(
  items: ZipExportItem[],
  outputPath: string,
  onProgress?: (completedEntries: number, totalEntries: number) => Promise<void>
) {
  const output = createWriteStream(outputPath, { flags: "wx" });
  const archive = archiver("zip", { forceZip64: true, zlib: { level: 6 } });
  const completedItemIds: string[] = [];
  const skipped: Array<{ id: string; error: string }> = [];
  let progressChain = Promise.resolve();

  const completed = new Promise<void>((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") reject(error);
    });
  });

  archive.on("progress", ({ entries }) => {
    if (!onProgress) return;
    progressChain = progressChain.then(() => onProgress(entries.processed, completedItemIds.length));
  });
  archive.pipe(output);

  for (const item of items) {
    try {
      const source = await stat(item.sourcePath);
      if (!source.isFile()) throw new Error("Quelle ist keine reguläre Datei.");
      archive.file(item.sourcePath, { name: item.relativePath });
      completedItemIds.push(item.id);
    } catch (error) {
      skipped.push({ id: item.id, error: error instanceof Error ? error.message : "Datei ist nicht lesbar." });
    }
  }

  await archive.finalize();
  await completed;
  await progressChain;
  return { completedItemIds, skipped };
}
