import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

describe("ResumableUpload", () => {
  it("offers a responsive accessible multi-format upload form", async () => {
    const { ResumableUpload } = await import("@/components/resumable-upload");
    const html = renderToStaticMarkup(
      <ResumableUpload
        accept=".pdf,.docx,.xlsx,.dcm,.epub,.eml,.heic"
        folders={[
          { id: "private-folder", name: "Privat / Unsortiert", visibility: "private" },
          { id: "family-folder", name: "Familie / Dokumente", visibility: "family" }
        ]}
      />
    );

    expect(html).toMatch(/<input[^>]*id="resumable-files"[^>]*type="file"[^>]*multiple=""/);
    expect(html).toContain(".dcm");
    expect(html).toContain("Dateien auswählen");
    expect(html).toContain("Upload starten");
    expect(html).toContain("Keine feste Dateigrößengrenze");
    expect(html).toContain("aria-live=\"polite\"");
  });
});
