"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, RotateCw, XCircle } from "lucide-react";
import { Button } from "@/components/button";
import { triggerUpdateAction, type UpdateActionState } from "@/server/actions/update";

const initialState: UpdateActionState = {};
const reloadPollIntervalMs = 1200;
const reloadMaxAttempts = 25;

const updateSteps = [
  { at: 0, progress: 8, label: "Update wird gestartet" },
  { at: 2500, progress: 24, label: "Watchtower prueft das Image" },
  { at: 7000, progress: 46, label: "Neue Version wird geladen" },
  { at: 15000, progress: 68, label: "Container wird aktualisiert" },
  { at: 30000, progress: 86, label: "Abschluss wird geprueft" },
  { at: 60000, progress: 94, label: "Warte auf Abschlussmeldung" }
];

function progressForElapsed(elapsedMs: number) {
  const currentStep = [...updateSteps].reverse().find((step) => elapsedMs >= step.at) ?? updateSteps[0];
  const nextStep = updateSteps.find((step) => step.at > elapsedMs);

  if (!nextStep) {
    return currentStep;
  }

  const span = nextStep.at - currentStep.at;
  const share = span > 0 ? (elapsedMs - currentStep.at) / span : 0;
  const progress = Math.round(currentStep.progress + (nextStep.progress - currentStep.progress) * share);

  return {
    progress,
    label: currentStep.label
  };
}

export function UpdateProgressForm({ canTriggerUpdate }: { canTriggerUpdate: boolean }) {
  const [state, action, pending] = useActionState(triggerUpdateAction, initialState);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const hasResult = state.ok !== undefined;
  const succeeded = state.ok === true && !pending;
  const failed = state.ok === false && !pending;
  const active = pending || hasResult;

  useEffect(() => {
    if (!pending) return;

    setElapsedMs(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);

    return () => window.clearInterval(timer);
  }, [pending]);

  const progressState = useMemo(() => {
    if (succeeded) {
      return {
        progress: 100,
        label: "Update abgeschlossen"
      };
    }

    if (failed) {
      return {
        progress: 100,
        label: "Update fehlgeschlagen"
      };
    }

    if (pending) {
      return progressForElapsed(elapsedMs);
    }

    return {
      progress: 0,
      label: "Bereit"
    };
  }, [elapsedMs, failed, pending, succeeded]);

  async function reloadFreshApp() {
    const url = new URL(window.location.href);
    url.searchParams.set("updated", Date.now().toString());

    setReloading(true);
    setReloadError(null);

    for (let attempt = 1; attempt <= reloadMaxAttempts; attempt += 1) {
      try {
        const response = await fetch(url.toString(), {
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "Cache-Control": "no-cache"
          }
        });
        const contentType = response.headers.get("content-type") ?? "";

        if (response.ok && contentType.includes("text/html")) {
          window.location.replace(url.toString());
          return;
        }
      } catch {
        // The app container may still be restarting. Keep polling before reloading the tab.
      }

      await new Promise((resolve) => window.setTimeout(resolve, reloadPollIntervalMs));
    }

    setReloadError("Die App ist noch nicht wieder bereit. Bitte gleich erneut versuchen.");
    setReloading(false);
  }

  return (
    <div className="w-full max-w-sm space-y-4 sm:text-right">
      <form action={action}>
        <Button type="submit" disabled={!canTriggerUpdate || pending || succeeded} className="w-full sm:w-auto">
          {pending ? <Loader2 size={18} className="animate-spin" /> : succeeded ? <CheckCircle2 size={18} /> : <RefreshCw size={18} />}
          {pending ? "Update laeuft" : succeeded ? "Update fertig" : canTriggerUpdate ? "Update starten" : "Kein Update"}
        </Button>
      </form>

      {active ? (
        <div className="space-y-3 text-left" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span>{progressState.label}</span>
            <span className="tabular-nums">{progressState.progress}%</span>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressState.progress}>
            <div
              className={`h-full rounded-full transition-all duration-500 ${failed ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${progressState.progress}%` }}
            />
          </div>

          {state.message ? (
            <p className={`text-sm leading-6 ${failed ? "text-red-700" : "text-emerald-700"}`}>
              {failed ? <XCircle size={16} className="mr-1 inline-block align-[-3px]" /> : <CheckCircle2 size={16} className="mr-1 inline-block align-[-3px]" />}
              {state.message}
            </p>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">Bitte warten. Die App zeigt die neue Version erst nach erfolgreichem Abschluss an.</p>
          )}

          {succeeded ? (
            <Button type="button" variant="secondary" onClick={reloadFreshApp} disabled={reloading} className="w-full">
              <RotateCw size={16} className={reloading ? "animate-spin" : ""} />
              {reloading ? "App wird geprueft" : "Jetzt aktualisieren"}
            </Button>
          ) : null}
          {reloadError ? <p className="text-sm leading-6 text-red-700">{reloadError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
