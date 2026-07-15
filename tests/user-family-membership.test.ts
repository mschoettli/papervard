import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  householdUpsert: vi.fn(async () => ({ id: "papervard-family" })),
  userCreate: vi.fn(async () => ({ id: "user-2" })),
  folderCreateMany: vi.fn(async () => ({ count: 2 }))
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hashed") } }));
vi.mock("@/server/auth", () => ({ requireAdmin: vi.fn(async () => ({ id: "admin-1" })) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      household: { upsert: mocks.householdUpsert },
      user: { create: mocks.userCreate },
      folder: { createMany: mocks.folderCreateMany }
    }))
  }
}));

describe("family membership on user creation", () => {
  it("adds every new user to the default family", async () => {
    const { createUserAction } = await import("@/server/actions/users");
    const formData = new FormData();
    formData.set("email", "mara@example.test");
    formData.set("name", "Mara Muster");
    formData.set("password", "very-secure-password");
    formData.set("role", "user");

    const result = await createUserAction(undefined, formData);

    expect(result.ok).toBe(true);
    expect(mocks.householdUpsert).toHaveBeenCalled();
    expect(mocks.userCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        householdMemberships: {
          create: { householdId: "papervard-family", role: "member" }
        }
      })
    }));
    expect(mocks.folderCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ id: "unsorted-private-user-2", isSystem: true }),
        expect.objectContaining({ id: "unsorted-family-papervard-family", isSystem: true })
      ])
    }));
  });
});
