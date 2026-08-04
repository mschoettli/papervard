import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("document card density", () => {
  it("uses a compact fluid grid for document cards and its loading state", () => {
    const page = source("src/app/(app)/documents/page.tsx");
    const loading = source("src/app/(app)/documents/loading.tsx");

    const compactGrid = "grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))]";
    expect(page).toContain(compactGrid);
    expect(loading).toContain(compactGrid);
    expect(page).not.toContain("min-h-[390px]");
  });

  it("uses a shorter preview frame while preserving the full document thumbnail", () => {
    const thumbnail = source("src/components/document-thumbnail.tsx");

    expect(thumbnail).toContain("aspect-[5/6]");
    expect(thumbnail).toContain("object-contain");
  });
});
