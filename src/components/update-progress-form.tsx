"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, RotateCw, XCircle } from "lucide-react";
import { Button } from "@/components/button";

const reloadPollIntervalMs = 1200;
const reloadMaxAttempts = 25;
const updateStatusPollIntervalMs = 2500;
const updateStatusMaxAttempts = 36;

type UpdateActionState = {
  ok?: boolean;
  message?: string;
};

type UpdateStatusResponse = {
  bootId: string;
  startedAt: string;
  currentSha: string | null;
  latestSha: string | null;
  updateAvailable: boolean;
  error: string | null;
  verifiedCurrent: boolean;
};

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
  const [state, setState] = useState<UpdateActionState>({});
  const [pending, setPending] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [verified, setVerified] = useState(false);
  const [startedFromBootId, setStartedFromBootId] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<UpdateStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const hasResult = state.ok !== undefined;
  const updateStarted = state.ok === true && !pending;
  const succeeded = updateStarted && verified;
  const failed = state.ok === false && !pending;
  const blocked = updateStarted && !checkingStatus && !verified && Boolean(statusError);
  const active = pending || hasResult || checkingStatus;

  useEffect(() => {
    if (!pending) return;

    setElapsedMs(0);
    setVerified(false);
    setStartedFromBootId(null);
    setLastStatus(null);
    setStatusError(null);
    setReloadError(null);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);

    return () => window.clearInterval(timer);
  }, [pending]);

  async function fetchUpdateStatus() {
    const response = await fetch("/api/update/status", {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Cache-Control": "no-cache"
      }
    });

    if (!response.ok) {
      throw new Error(`Status konnte nicht geladen werden (${response.status}).`);
    }

    return (await response.json()) as UpdateStatusResponse;
  }

  async function startUpdate() {
    if (!canTriggerUpdate || pending || checkingStatus || succeeded) return;

    setPending(true);
    setState({});
    setElapsedMs(0);
    setVerified(false);
    setStartedFromBootId(null);
    setLastStatus(null);
    setStatusError(null);
    setReloadError(null);

    try {
      const beforeStatus = await fetchUpdateStatus().catch(() => null);
      setStartedFromBootId(beforeStatus?.bootId ?? null);
      setLastStatus(beforeStatus);

      const response = await fetch("/api/update/start", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Cache-Control": "no-cache"
        }
      });
      const result = (await response.json().catch(() => ({
        ok: false,
        message: `Update konnte nicht gestartet werden. Server antwortet mit ${response.status}.`
      }))) as UpdateActionState;

      setState({
        ok: Boolean(result.ok),
        message: result.message ?? (response.ok ? "Update wurde gestartet." : "Update konnte nicht gestartet werden.")
      });
    } catch (error) {
      setState({
        ok: true,
        message:
          error instanceof Error
            ? `Verbindung waehrend des Update-Starts unterbrochen: ${error.message}. Die App prueft jetzt, ob der Neustart laeuft.`
            : "Verbindung waehrend des Update-Starts unterbrochen. Die App prueft jetzt, ob der Neustart laeuft."
      });
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!updateStarted || verified) return;

    let cancelled = false;
    setCheckingStatus(true);
    setStatusError(null);

    async function pollUpdateStatus() {
      for (let attempt = 1; attempt <= updateStatusMaxAttempts; attempt += 1) {
        if (cancelled) return;

        try {
          const status = await fetchUpdateStatus();
          setLastStatus(status);
          const bootChanged = Boolean(startedFromBootId && status.bootId && status.bootId !== startedFromBootId);

          if (status.verifiedCurrent || bootChanged) {
            setVerified(true);
            setCheckingStatus(false);
            setStatusError(null);
            return;
          }

          if (status.error && !status.currentSha) {
            setStatusError(status.error);
          }
        } catch {
          // During the container restart the app can be unreachable for a moment.
        }

        await new Promise((resolve) => window.setTimeout(resolve, updateStatusPollIntervalMs));
      }

      if (!cancelled) {
        setCheckingStatus(false);
        setStatusError("Kein App-Neustart erkannt. Watchtower hat vermutlich kein neues Image gezogen oder das neue Image ist noch nicht angekommen.");
      }
    }

    pollUpdateStatus();

    return () => {
      cancelled = true;
    };
  }, [startedFromBootId, updateStarted, verified]);

  const progressState = useMemo(() => {
    if (succeeded) {
      return {
        progress: 100,
        label: "Neue Version aktiv"
      };
    }

    if (failed || blocked) {
      return {
        progress: 100,
        label: blocked ? "Neustart nicht erkannt" : "Update fehlgeschlagen"
      };
    }

    if (pending) {
      return progressForElapsed(elapsedMs);
    }

    if (checkingStatus || updateStarted) {
      return {
        progress: 96,
        label: "Neue Version wird bestaetigt"
      };
    }

    return {
      progress: 0,
      label: "Bereit"
    };
  }, [blocked, checkingStatus, elapsedMs, failed, pending, succeeded, updateStarted]);

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
      <Button type="button" onClick={startUpdate} disabled={!canTriggerUpdate || pending || checkingStatus || succeeded} className="w-full sm:w-auto">
        {pending ? <Loader2 size={18} className="animate-spin" /> : succeeded ? <CheckCircle2 size={18} /> : <RefreshCw size={18} />}
        {pending ? "Update startet" : checkingStatus ? "Pruefe Version" : succeeded ? "Update fertig" : canTriggerUpdate ? "Update starten" : "Kein Update"}
      </Button>

      {active ? (
        <div className="space-y-3 text-left" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span>{progressState.label}</span>
            <span className="tabular-nums">{progressState.progress}%</span>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressState.progress}>
            <div
              className={`h-full rounded-full transition-all duration-500 ${failed || blocked ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${progressState.progress}%` }}
            />
          </div>

          {state.message ? (
            <p className={`text-sm leading-6 ${failed || blocked ? "text-red-700" : "text-emerald-700"}`}>
              {failed || blocked ? <XCircle size={16} className="mr-1 inline-block align-[-3px]" /> : succeeded ? <CheckCircle2 size={16} className="mr-1 inline-block align-[-3px]" /> : <Loader2 size={16} className="mr-1 inline-block animate-spin align-[-3px]" />}
              {succeeded ? "Update bestaetigt. Die neue Version ist aktiv und kann jetzt geladen werden." : state.message}
            </p>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">Bitte warten. Die App zeigt die neue Version erst nach erfolgreichem Abschluss an.</p>
          )}
          {statusError ? <p className={`text-sm leading-6 ${blocked ? "text-red-700" : "text-amber-700"}`}>{statusError}</p> : null}
          {blocked && lastStatus ? (
            <dl className="grid gap-1 rounded-md bg-red-50 p-3 text-xs text-red-800">
              <div className="flex justify-between gap-3">
                <dt>Vorheriger Start</dt>
                <dd className="font-mono">{startedFromBootId ? startedFromBootId.slice(0, 8) : "unbekannt"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Aktueller Start</dt>
                <dd className="font-mono">{lastStatus.bootId ? lastStatus.bootId.slice(0, 8) : "unbekannt"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Installiert</dt>
                <dd className="font-mono">{lastStatus.currentSha ? lastStatus.currentSha.slice(0, 7) : "unbekannt"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Ziel</dt>
                <dd className="font-mono">{lastStatus.latestSha ? lastStatus.latestSha.slice(0, 7) : "unbekannt"}</dd>
              </div>
            </dl>
          ) : null}

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
