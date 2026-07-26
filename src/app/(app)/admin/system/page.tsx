import { Palette, Rocket, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { UpdateProgressForm } from "@/components/update-progress-form";
import { requireAdmin } from "@/server/auth";
import { getUpdateStatus } from "@/server/update";

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
        <p className="mt-1 text-sm text-muted-foreground">Darstellung und Installation verwalten.</p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Palette aria-hidden="true" size={20} className="text-primary" />
              <h2 className="text-lg font-semibold">Darstellung</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Die Auswahl gilt dauerhaft für diesen Browser.</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              {status.canTriggerUpdate ? <Rocket size={20} className="text-primary" /> : <ShieldCheck size={20} className="text-emerald-700" />}
              <h2 className="text-lg font-semibold">{status.statusLabel}</h2>
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
            {!status.currentSha && !status.managedExternally ? (
              <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                Die installierte Image-Version ist nicht im Container hinterlegt. Du kannst Watchtower trotzdem manuell starten.
              </p>
            ) : null}
            {status.error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{status.error}</p> : null}
            {status.latestUrl ? (
              <a href={status.latestUrl} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
                Letzten Commit auf GitHub ansehen
              </a>
            ) : null}
          </div>

          {status.managedExternally ? (
            <div className="max-w-sm rounded-md bg-blue-50 p-4 text-sm text-blue-900">
              Diese Installation wird von Runvard aktualisiert. Öffne dafür den Runvard App-Store und wähle bei Papervard „Update“.
            </div>
          ) : (
            <UpdateProgressForm canTriggerUpdate={status.canTriggerUpdate} />
          )}
        </div>
      </section>
    </div>
  );
}
