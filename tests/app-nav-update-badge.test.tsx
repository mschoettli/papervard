import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({ usePathname: () => "/documents" }));
vi.mock("next/image", () => ({
  default: ({ priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => <img alt="" {...props} />
}));
vi.mock("@/server/actions/auth", () => ({ logoutAction: vi.fn() }));

describe("AppNav update badge", () => {
  it("shows an accessible red update hint on the System link", async () => {
    const { AppNav } = await import("@/components/app-nav");
    const html = renderToStaticMarkup(
      <AppNav
        user={{ name: "Mara", email: "mara@example.test", role: "admin" }}
        updateAvailable
      />
    );

    expect(html).toContain("Update verfügbar");
    expect(html).toContain("bg-red-600");
    expect(html).toMatch(/href="\/admin\/system"[^>]*>[\s\S]*Update/);
  });
});
