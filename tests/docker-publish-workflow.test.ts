import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Docker image publishing", () => {
  it("publishes Papervard for AMD64 and ARM64", async () => {
    const workflow = await readFile(
      path.join(process.cwd(), ".github/workflows/docker-image.yml"),
      "utf8"
    );

    expect(workflow).toContain("docker/setup-qemu-action@v3");
    expect(workflow).toContain("platforms: linux/amd64,linux/arm64");
  });

  it("allows an external platform such as Runvard to own updates", async () => {
    const compose = await readFile(path.join(process.cwd(), "docker-compose.yml"), "utf8");
    const envExample = await readFile(path.join(process.cwd(), ".env.example"), "utf8");

    expect(compose).toContain("PAPERVARD_UPDATE_MODE: ${PAPERVARD_UPDATE_MODE:-internal}");
    expect(envExample).toContain('PAPERVARD_UPDATE_MODE="internal"');
  });
});
