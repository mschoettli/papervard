import { describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn(async (..._args: unknown[]) => []);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    householdMember: {
      findMany: vi.fn(async () => [{ householdId: "family-1" }])
    },
    $queryRawUnsafe: queryRaw
  }
}));

describe("document search access", () => {
  it("binds the current user and family memberships into every search", async () => {
    const { hybridSearch } = await import("@/server/search/search");

    await hybridSearch("user-1", "rechnung");

    const [sql, ...params] = queryRaw.mock.calls[0] ?? [];
    expect(sql).toContain('d."ownerUserId"');
    expect(sql).toContain('d."visibility"');
    expect(params[0]).toBe("rechnung");
    expect(params).toContain("user-1");
    expect(params).toContainEqual(["family-1"]);
  });
});
