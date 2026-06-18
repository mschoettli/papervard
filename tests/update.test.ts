import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
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

  it("falls back to the public commit feed when the GitHub API is rate limited", async () => {
    vi.stubEnv("APP_GIT_SHA", "4caf8de1234567890");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("rate limited", { status: 403 }))
        .mockResolvedValueOnce(
          new Response(
            `<feed>
              <entry>
                <link href="https://github.com/mschoettli/papervard/commit/4caf8de1234567890" />
              </entry>
            </feed>`,
            { status: 200, headers: { "Content-Type": "application/atom+xml" } }
          )
        )
    );

    const { getUpdateStatus } = await import("@/server/update");
    const status = await getUpdateStatus();

    expect(status).toMatchObject({
      currentSha: "4caf8de1234567890",
      latestSha: "4caf8de1234567890",
      latestUrl: "https://github.com/mschoettli/papervard/commit/4caf8de1234567890",
      updateAvailable: false,
      canTriggerUpdate: false,
      statusLabel: "App ist aktuell",
      error: null
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

  it("explains when the Watchtower API takes longer than the update timeout", async () => {
    vi.stubEnv("UPDATE_API_URL", "http://watchtower:8080/v1/update");
    vi.stubEnv("WATCHTOWER_HTTP_API_TOKEN", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("This operation was aborted", "AbortError");
      })
    );

    const { triggerContainerUpdate } = await import("@/server/update");
    const result = await triggerContainerUpdate();

    expect(result).toEqual({
      ok: false,
      message: "Update-API hat nicht rechtzeitig geantwortet. Watchtower laeuft eventuell noch; bitte in ein paar Minuten neu laden."
    });
  });

  it("returns after Watchtower has accepted the update request so the client can verify the new version", async () => {
    vi.useFakeTimers();
    vi.stubEnv("UPDATE_API_URL", "http://watchtower:8080/v1/update");
    vi.stubEnv("WATCHTOWER_HTTP_API_TOKEN", "secret");

    let finishUpdate: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finishUpdate = resolve;
          })
      )
    );

    const { triggerContainerUpdate } = await import("@/server/update");
    const resultPromise = triggerContainerUpdate();

    await vi.advanceTimersByTimeAsync(2000);
    await expect(resultPromise).resolves.toEqual({
      ok: true,
      message: "Update wurde gestartet. Die App prueft jetzt, bis die neue Version wirklich aktiv ist."
    });

    finishUpdate(new Response(null, { status: 200 }));
    await vi.runOnlyPendingTimersAsync();
  });
});
