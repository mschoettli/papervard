import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("update status", () => {
  it("keeps manual updates available when the installed image version is unknown", async () => {
    vi.stubEnv("APP_GIT_SHA", "unknown");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          sha: "abc1234567890",
          html_url: "https://github.com/mschoettli/papervard/commit/abc1234567890"
        })
      )
    );

    const { getUpdateStatus } = await import("@/server/update");
    const status = await getUpdateStatus();

    expect(status).toMatchObject({
      currentSha: null,
      latestSha: "abc1234567890",
      updateAvailable: false,
      canTriggerUpdate: true,
      statusLabel: "Installierte Version unbekannt"
    });
  });

  it("disables manual updates only when the installed version matches GitHub", async () => {
    vi.stubEnv("APP_GIT_SHA", "abc1234567890");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          sha: "abc1234567890",
          html_url: "https://github.com/mschoettli/papervard/commit/abc1234567890"
        })
      )
    );

    const { getUpdateStatus } = await import("@/server/update");
    const status = await getUpdateStatus();

    expect(status).toMatchObject({
      updateAvailable: false,
      canTriggerUpdate: false,
      statusLabel: "App ist aktuell"
    });
  });
});

describe("triggerContainerUpdate", () => {
  it("returns a visible error when the Watchtower API cannot be reached", async () => {
    vi.stubEnv("UPDATE_API_URL", "http://watchtower:8080/v1/update");
    vi.stubEnv("WATCHTOWER_HTTP_API_TOKEN", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND watchtower");
      })
    );

    const { triggerContainerUpdate } = await import("@/server/update");
    const result = await triggerContainerUpdate();

    expect(result).toEqual({
      ok: false,
      message: "Update-API konnte nicht erreicht werden: getaddrinfo ENOTFOUND watchtower"
    });
  });
});
