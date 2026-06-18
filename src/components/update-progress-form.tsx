"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, RotateCw, XCircle } from "lucide-react";
import { Button } from "@/components/button";
import { triggerUpdateAction, type UpdateActionState } from "@/server/actions/update";

const initialState: UpdateActionState = {};

const updateSteps = [
  { at: 0, progress: 8, label: "Update wird gestartet" },
  { at: 2500, progress: 24, label: "Watchtower prueft das Image" },
  { at: 7000, progress: 46, label: "Neue Version wird geladen" },
  { at: 15000, progress: 68, label: "Container wird aktualisiert" },
  { at: 30000, progress: 86, label: "Abschluss wird geprueft" },
  { at: 60000, progress: 94, label: "Warte auf Abschlussmeldung" }
];

function reloadFreshApp() {
  const url = new URL(window.location.href);
  url.searchParams.set("updated", Date.now().toString());
  window.location.assign(url.toString());
}

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
            <Button type="button" variant="secondary" onClick={reloadFreshApp} className="w-full">
              <RotateCw size={16} />
              Jetzt aktualisieren
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
