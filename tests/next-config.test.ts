import { describe, expect, it } from "vitest";

describe("Next.js browser bundling", () => {
  it("keeps Cornerstone's guarded Node imports out of the client bundle", async () => {
    // @ts-expect-error The executable Next.js config is intentionally an ESM JavaScript file.
    const { default: nextConfig } = await import("../next.config.mjs");
    const baseConfig = {
      resolve: { fallback: { crypto: false } },
      experiments: {}
    };

    const configured = nextConfig.webpack?.(baseConfig, { isServer: false });

    expect(configured.resolve.fallback).toEqual({
      crypto: false,
      fs: false,
      path: false
    });
    expect(configured.experiments.asyncWebAssembly).toBe(true);
  });
});
