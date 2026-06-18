import "server-only";

export type UpdateStatus = {
  currentSha: string | null;
  latestSha: string | null;
  latestUrl: string | null;
  updateAvailable: boolean;
  error: string | null;
};

const repository = process.env.GITHUB_REPOSITORY ?? "mschoettli/papervard";
const branch = process.env.GITHUB_BRANCH ?? "main";

export function currentVersion() {
  const sha = process.env.APP_GIT_SHA;
  return sha && sha !== "unknown" ? sha : null;
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const currentSha = currentVersion();

  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/commits/${branch}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "papervard-update-check"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        currentSha,
        latestSha: null,
        latestUrl: null,
        updateAvailable: false,
        error: `GitHub antwortet mit ${response.status}.`
      };
    }

    const data = (await response.json()) as {
      sha?: string;
      html_url?: string;
    };
    const latestSha = data.sha ?? null;

    return {
      currentSha,
      latestSha,
      latestUrl: data.html_url ?? null,
      updateAvailable: Boolean(currentSha && latestSha && currentSha !== latestSha),
      error: null
    };
  } catch (error) {
    return {
      currentSha,
      latestSha: null,
      latestUrl: null,
      updateAvailable: false,
      error: error instanceof Error ? error.message : "Update-Pruefung fehlgeschlagen."
    };
  }
}

export async function triggerContainerUpdate() {
  const url = process.env.UPDATE_API_URL;
  const token = process.env.WATCHTOWER_HTTP_API_TOKEN;

  if (!url || !token) {
    return {
      ok: false,
      message: "Update-API ist nicht konfiguriert. Pruefe UPDATE_API_URL und WATCHTOWER_HTTP_API_TOKEN."
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    return {
      ok: false,
      message: `Update konnte nicht gestartet werden. Watchtower antwortet mit ${response.status}.`
    };
  }

  return {
    ok: true,
    message: "Update wurde gestartet. Die App kann gleich kurz neu laden."
  };
}
