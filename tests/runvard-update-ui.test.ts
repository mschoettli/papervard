import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("externally managed update UI", () => {
  it("directs Runvard installations back to the Runvard App-Store", async () => {
    const page = await readFile(
      path.join(process.cwd(), "src/app/(app)/admin/system/page.tsx"),
      "utf8"
    );
    const route = await readFile(
      path.join(process.cwd(), "src/app/api/update/status/route.ts"),
      "utf8"
    );

    expect(page).toContain("status.managedExternally");
    expect(page).toContain("Runvard App-Store");
    expect(route).toContain("managedExternally: status.managedExternally");
  });
});
