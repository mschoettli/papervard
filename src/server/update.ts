import "server-only";
import { randomUUID } from "node:crypto";

export type UpdateStatus = {
  currentSha: string | null;
  latestSha: string | null;
  latestUrl: string | null;
  updateAvailable: boolean;
  canTriggerUpdate: boolean;
  managedExternally: boolean;
  statusLabel: string;
  error: string | null;
};

const serverStartedAt = new Date();
const serverBootId = randomUUID();
const repository = process.env.GITHUB_REPOSITORY ?? "mschoettli/papervard";
const branch = process.env.GITHUB_BRANCH ?? "main";
const updateTimeoutMs = 10 * 60 * 1000;
const updateStartAckMs = 2 * 1000;

type LatestCommit = {
  sha: string | null;
  url: string | null;
};

export function currentVersion() {
  const sha = process.env.APP_GIT_SHA;
  return sha && sha !== "unknown" ? sha : null;
}

export function currentRuntime() {
  return {
    bootId: serverBootId,
    startedAt: serverStartedAt.toISOString()
  };
}

function isExternallyManaged() {
  return process.env.PAPERVARD_UPDATE_MODE !== "internal";
}

function updateStatus(currentSha: string | null, latest: LatestCommit, error: string | null): UpdateStatus {
  const updateAvailable = Boolean(currentSha && latest.sha && currentSha !== latest.sha);
  const managedExternally = isExternallyManaged();

  return {
    currentSha,
    latestSha: latest.sha,
    latestUrl: latest.url,
    updateAvailable,
    canTriggerUpdate: !managedExternally && (updateAvailable || !currentSha || Boolean(error)),
    managedExternally,
    statusLabel: managedExternally
      ? "Update wird von Runvard verwaltet"
      : error
      ? "Update-Status nicht pruefbar"
      : updateAvailable
        ? "Update verfuegbar"
        : currentSha
          ? "App ist aktuell"
          : "Installierte Version unbekannt",
    error
  };
}

async function fetchLatestCommitFromApi(): Promise<LatestCommit> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "papervard-update-check"
  };
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  const response = await fetch(`https://api.github.com/repos/${repository}/commits/${branch}`, {
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`GitHub API antwortet mit ${response.status}.`);
  }

  const data = (await response.json()) as {
    sha?: string;
    html_url?: string;
  };

  return {
    sha: data.sha ?? null,
    url: data.html_url ?? null
  };
}

async function fetchLatestCommitFromFeed(): Promise<LatestCommit> {
  const response = await fetch(`https://github.com/${repository}/commits/${branch}.atom`, {
    headers: {
      Accept: "application/atom+xml",
      "User-Agent": "papervard-update-check"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`GitHub Feed antwortet mit ${response.status}.`);
  }

  const feed = await response.text();
  const url = feed.match(/<entry>[\s\S]*?<link[^>]+href="([^"]+)"/)?.[1] ?? null;
  const sha = url?.match(/\/commit\/([a-f0-9]{7,40})/i)?.[1] ?? null;

  return {
    sha,
    url
  };
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const currentSha = currentVersion();

  try {
    return updateStatus(currentSha, await fetchLatestCommitFromApi(), null);
  } catch (apiError) {
    try {
      return updateStatus(currentSha, await fetchLatestCommitFromFeed(), null);
    } catch (feedError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "GitHub API fehlgeschlagen.";
      const feedMessage = feedError instanceof Error ? feedError.message : "GitHub Feed fehlgeschlagen.";
      return updateStatus(currentSha, { sha: null, url: null }, `${apiMessage} ${feedMessage}`);
    }
  }
}

export async function triggerContainerUpdate() {
  if (isExternallyManaged()) {
    return {
      ok: false,
      message: "Updates werden von Runvard verwaltet. Starte das Update im Runvard App-Store."
    };
  }

  const url = process.env.UPDATE_API_URL;
  const token = process.env.WATCHTOWER_HTTP_API_TOKEN;

  if (!url || !token) {
    return {
      ok: false,
      message: "Update-API ist nicht konfiguriert. Pruefe UPDATE_API_URL und WATCHTOWER_HTTP_API_TOKEN."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), updateTimeoutMs);
  const request = fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  try {
    const response = await Promise.race<Response | "started">([
      request,
      new Promise<"started">((resolve) => setTimeout(() => resolve("started"), updateStartAckMs))
    ]);

    if (response === "started") {
      request.catch(() => undefined);
      return {
        ok: true,
        message: "Update wurde gestartet. Die App prueft jetzt, bis die neue Version wirklich aktiv ist."
      };
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const detail = responseText.trim() ? ` ${responseText.trim()}` : "";
      return {
        ok: false,
        message: `Update wurde nicht abgeschlossen. Watchtower antwortet mit ${response.status}.${detail}`
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        message: "Update-API hat nicht rechtzeitig geantwortet. Watchtower laeuft eventuell noch; bitte in ein paar Minuten neu laden."
      };
    }

    return {
      ok: false,
      message: error instanceof Error ? `Update-API konnte nicht erreicht werden: ${error.message}` : "Update-API konnte nicht erreicht werden."
    };
  } finally {
    clearTimeout(timeout);
  }

  return {
    ok: true,
    message: "Update wurde gestartet. Die App prueft jetzt, bis die neue Version wirklich aktiv ist."
  };
}
