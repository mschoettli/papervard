import { RefreshCw, Rocket, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/server/auth";
import { getUpdateStatus } from "@/server/update";
import { triggerUpdateAction } from "@/server/actions/update";

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 7) : "unbekannt";
}

export default async function SystemPage() {
  await requireAdmin();
  const status = await getUpdateStatus();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal">System</h1>
        <p className="mt-1 text-sm text-muted-foreground">Version pruefen und neue GitHub-Images installieren.</p>
      </header>

      <section className="rounded-lg border border-border bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              {status.updateAvailable ? <Rocket size={20} className="text-primary" /> : <ShieldCheck size={20} className="text-emerald-700" />}
              <h2 className="text-lg font-semibold">
                {status.updateAvailable ? "Update verfuegbar" : "App ist aktuell"}
              </h2>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Installiert</dt>
                <dd className="mt-1 font-mono">{shortSha(status.currentSha)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">GitHub main</dt>
                <dd className="mt-1 font-mono">{shortSha(status.latestSha)}</dd>
              </div>
            </dl>
            {status.error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{status.error}</p> : null}
            {status.latestUrl ? (
              <a href={status.latestUrl} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
                Letzten Commit auf GitHub ansehen
              </a>
            ) : null}
          </div>

          <form action={triggerUpdateAction}>
            <button
              disabled={!status.updateAvailable}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              <RefreshCw size={18} />
              Aktualisieren
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-white p-5">
        <h2 className="text-base font-semibold">Update-Ablauf</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Der Button ruft Watchtower im Docker-Netzwerk auf. Watchtower zieht das neue
          <span className="font-mono"> ghcr.io/mschoettli/papervard:latest </span>
          Image und startet den App-Container neu.
        </p>
      </section>
    </div>
  );
}
