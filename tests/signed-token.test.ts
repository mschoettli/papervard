import { describe, expect, it } from "vitest";

describe("short-lived signed tokens", () => {
  it("verifies an intact token and rejects tampering or expiry", async () => {
    process.env.PAPERVARD_SIGNING_SECRET = "test-secret-with-enough-entropy";
    const { signToken, verifyToken } = await import("@/server/security/signed-token");
    const token = signToken({ purpose: "office-file", documentId: "doc-1" }, 60);

    expect(verifyToken(token, "office-file")).toEqual(expect.objectContaining({ documentId: "doc-1" }));
    expect(() => verifyToken(`${token}x`, "office-file")).toThrow("Signatur");

    const expired = signToken({ purpose: "office-file", documentId: "doc-1" }, -1);
    expect(() => verifyToken(expired, "office-file")).toThrow("abgelaufen");
  });
});
