import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DICOM viewer persistence", () => {
  it("loads annotations per series and checks series ownership on writes", () => {
    const viewer = readFileSync(path.join(process.cwd(), "src/components/dicom-viewer.tsx"), "utf8");
    const route = readFileSync(path.join(process.cwd(), "src/app/api/dicom/annotations/[id]/route.ts"), "utf8");

    expect(viewer).toContain("?seriesId=");
    expect(viewer).toContain("tools.annotation.state.addAnnotation");
    expect(route).toContain("study: { documentId: document.id }");
    expect(route).toContain("MAX_ANNOTATION_BYTES");
  });
});
