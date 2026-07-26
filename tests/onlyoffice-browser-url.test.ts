import { describe, expect, it } from "vitest";
import { resolveOnlyOfficeServerUrl } from "@/components/onlyoffice-editor";

describe("ONLYOFFICE browser URL", () => {
  it("uses the browser host with a Runvard-assigned port", () => {
    expect(resolveOnlyOfficeServerUrl("auto:8082", {
      protocol: "http:",
      hostname: "runvard.lan"
    })).toBe("http://runvard.lan:8082");
  });

  it("keeps an explicitly configured URL unchanged", () => {
    expect(resolveOnlyOfficeServerUrl("https://office.example.test", {
      protocol: "https:",
      hostname: "papervard.example.test"
    })).toBe("https://office.example.test");
  });
});
