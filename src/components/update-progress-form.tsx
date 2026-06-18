"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { triggerUpdateAction, type UpdateActionState } from "@/server/actions/update";

const initialState: UpdateActionState = {};

function reloadFreshApp() {
  const url = new URL(window.location.href);
  url.searchParams.set("updated", Date.now().toString());
  window.location.assign(url.toString());
}

export function UpdateProgressForm({ canTriggerUpdate }: { canTriggerUpdate: boolean }) {
  const [state, action, pending] = useActionState(triggerUpdateAction, initialState);
  const [progress, setProgress] = useState(0);
  const started = pending || state.ok !== undefined || progress > 0;
  const complete = state.ok === true && !pending;

  useEffect(() => {
    if (!pending) return;
    setProgress(12);
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(current + 8, 92));
    }, 450);
    return () => window.clearInterval(timer);
  }, [pending]);

  useEffect(() => {
    if (state.ok !== undefined && !pending) {
      setProgress(100);
    }
  }, [pending, state.ok]);

  return (
    <div className="w-full max-w-xs space-y-3 sm:text-right">
      <form action={action}>
        <button
          disabled={!canTriggerUpdate || pending || complete}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
        >
          <RefreshCw size={18} className={pending ? "animate-spin" : ""} />
          {pending ? "Update läuft ..." : complete ? "Update gestartet" : canTriggerUpdate ? "Aktualisieren" : "Kein Update"}
        </button>
      </form>

      {started ? (
        <div className="rounded-lg border border-border bg-white p-3 text-left">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{complete ? "Fertig" : pending ? "Update wird vorbereitet" : state.ok === false ? "Fehler" : "Bereit"}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {state.message ? (
            <p className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>
          ) : null}
          {complete ? (
            <button
              type="button"
              onClick={reloadFreshApp}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
            >
              <CheckCircle2 size={16} />
              App aktualisieren
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
