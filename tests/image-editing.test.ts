import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("safe image editing", () => {
  it("writes a rotated derived file while leaving the source dimensions unchanged", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "papervard-image-edit-"));
    directories.push(directory);
    const source = path.join(directory, "source.png");
    const target = path.join(directory, "target.png");
    await sharp({ create: { width: 2, height: 3, channels: 3, background: "red" } }).png().toFile(source);

    const { transformImageFile } = await import("@/server/editing/versions");
    await transformImageFile(source, target, "scan.png", { rotate: 90 });

    expect(await sharp(source).metadata()).toMatchObject({ width: 2, height: 3, format: "png" });
    expect(await sharp(target).metadata()).toMatchObject({ width: 3, height: 2, format: "png" });
  });
});
