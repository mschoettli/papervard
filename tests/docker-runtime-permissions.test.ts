import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Docker runtime permissions", () => {
  it("exports the prepared persistent storage paths to app and worker", async () => {
    const entrypoint = await readFile(path.join(process.cwd(), "docker-entrypoint.sh"), "utf8");

    expect(entrypoint).toContain('PAPERVARD_CONFIG_PATH="$CONFIG_PATH"');
    expect(entrypoint).toContain('PAPERVARD_DATA_PATH="$DATA_PATH"');
    expect(entrypoint).toMatch(/export[^\n]*PAPERVARD_CONFIG_PATH[^\n]*PAPERVARD_DATA_PATH/);
  });

  it("makes the Next.js runtime cache writable by the unprivileged app user", async () => {
    const dockerfile = await readFile(path.join(process.cwd(), "Dockerfile"), "utf8");

    expect(dockerfile).toContain("mkdir -p /app/.next/cache");
    expect(dockerfile).toContain("chown -R nextjs:nodejs /app/.next/cache");
  });
});
