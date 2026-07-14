import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

describe("MultiPdfInput", () => {
  it("offers one accessible multiple-file drop target", async () => {
    const { MultiPdfInput } = await import("@/components/multi-pdf-input");
    const html = renderToStaticMarkup(<MultiPdfInput />);

    expect(html).toMatch(/<input[^>]*type="file"[^>]*multiple=""/);
    expect(html).toContain("PDFs hier ablegen");
    expect(html).toContain("Mehrere PDFs sind möglich");
  });
});
