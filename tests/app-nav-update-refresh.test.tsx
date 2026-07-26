// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/navigation", () => ({ usePathname: () => "/documents" }));
vi.mock("next/image", () => ({
  default: ({ priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => <img alt="" {...props} />
}));
vi.mock("@/server/actions/auth", () => ({ logoutAction: vi.fn() }));

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AppNav update refresh", () => {
  it("checks again when the browser window regains focus", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ updateAvailable: false }))
      .mockResolvedValueOnce(Response.json({ updateAvailable: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { AppNav } = await import("@/components/app-nav");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<AppNav user={{ name: "Mara", email: "mara@example.test", role: "admin" }} />);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Update");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Update");

    await act(async () => root.unmount());
  });

  it("checks periodically while Papervard remains open", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ updateAvailable: false }))
      .mockResolvedValueOnce(Response.json({ updateAvailable: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { AppNav } = await import("@/components/app-nav");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<AppNav user={{ name: "Mara", email: "mara@example.test", role: "admin" }} />);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Update");

    await act(async () => root.unmount());
  });
});
