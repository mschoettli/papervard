// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumableUpload } from "@/components/resumable-upload";
import { UploadManagerProvider, UploadStatusDock } from "@/components/upload-manager";

describe("ResumableUpload browser interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <UploadManagerProvider>
          <ResumableUpload accept=".pdf,.dcm" folders={[]} />
          <UploadStatusDock />
        </UploadManagerProvider>
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("accepts a selected file when randomUUID is unavailable on a local HTTP origin", () => {
    vi.stubGlobal("crypto", { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    const file = new File(["invoice"], "rechnung.pdf", { type: "application/pdf" });
    const input = container.querySelector<HTMLInputElement>("#resumable-files");
    expect(input).not.toBeNull();
    Object.defineProperty(input, "files", { configurable: true, value: [file] });

    act(() => input?.dispatchEvent(new Event("change", { bubbles: true })));

    expect(container.textContent).toContain("rechnung.pdf");
    expect(container.textContent).toContain("Bereit");
  });

  it("accepts files dropped onto the visible upload field", () => {
    const file = new File(["scan"], "scan.dcm", { type: "application/dicom" });
    const dropTarget = container.querySelector<HTMLElement>("[data-upload-dropzone]");
    expect(dropTarget).not.toBeNull();
    const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOver, "dataTransfer", {
      value: { files: [file], dropEffect: "none" }
    });

    act(() => dropTarget?.dispatchEvent(dragOver));
    expect(dragOver.defaultPrevented).toBe(true);

    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [file], dropEffect: "none" }
    });
    act(() => dropTarget?.dispatchEvent(drop));

    expect(drop.defaultPrevented).toBe(true);
    expect(container.textContent).toContain("scan.dcm");
  });

  it("keeps the selected upload visible when the upload form is removed during navigation", () => {
    const file = new File(["invoice"], "navigation.pdf", { type: "application/pdf" });
    const input = container.querySelector<HTMLInputElement>("#resumable-files");
    Object.defineProperty(input, "files", { configurable: true, value: [file] });

    act(() => input?.dispatchEvent(new Event("change", { bubbles: true })));
    act(() => {
      root.render(
        <UploadManagerProvider>
          <UploadStatusDock />
        </UploadManagerProvider>
      );
    });

    expect(container.textContent).toContain("navigation.pdf");
  });
});
