import { beforeEach, describe, expect, it } from "vitest";

describe("DICOM field encryption", () => {
  beforeEach(() => {
    process.env.DICOM_FIELD_KEY = Buffer.alloc(32, 11).toString("base64");
  });

  it("encrypts identifying metadata with authenticated encryption", async () => {
    const { encryptSensitiveField, decryptSensitiveField } = await import("@/server/security/field-encryption");
    const encrypted = encryptSensitiveField("Muster^Anna", "study-1:patient-name");

    expect(encrypted).not.toContain("Muster");
    expect(decryptSensitiveField(encrypted, "study-1:patient-name")).toBe("Muster^Anna");
    expect(() => decryptSensitiveField(encrypted, "study-2:patient-name")).toThrow();
  });
});
