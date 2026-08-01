"use client";

import { Archive, ChevronUp, CircleCheck, Download, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatBytes } from "@/lib/utils";

type ExportItem = {
  id: string;
  status: "queued" | "processing" | "completed" | "completed_with_warnings" | "failed" | "canceled" | "expired";
  progress: number;
  totalItems: number;
  completedItems: number;
  skippedItems: number;
  outputSize: string | null;
  error: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export function ExportStatusDock() {
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/document-exports", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as { exports: ExportItem[] };
      setExports(result.exports);
    } catch {
      // A temporary connection loss is retried by the next polling cycle.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const created = () => void refresh();
    window.addEventListener("papervard:export-created", created);
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => {
      window.removeEventListener("papervard:export-created", created);
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function retry(id: string) {
    setMessage("");
    const response = await fetch(`/api/document-exports/${id}/retry`, { method: "POST" });
    const result = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) setMessage(result.message ?? "Export konnte nicht wiederholt werden.");
    await refresh();
  }

  async function dismiss(id: string) {
    setMessage("");
    const response = await fetch(`/api/document-exports/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { message?: string };
      setMessage(result.message ?? "Export konnte nicht entfernt werden.");
    }
    await refresh();
  }

  if (exports.length === 0) return null;
  const active = exports.filter((item) => item.status === "queued" || item.status === "processing").length;

  return (
    <details className="w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" open={active > 0}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
        {active > 0 ? <LoaderCircle aria-hidden="true" size={19} className="animate-spin text-primary motion-reduce:animate-none" /> : <CircleCheck aria-hidden="true" size={19} className="text-primary" />}
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{active > 0 ? "Exporte werden erstellt" : "Exporte"}</span><span className="block text-xs text-muted-foreground"><span className="tabular-nums">{exports.length}</span> Aufträge</span></span>
        <ChevronUp aria-hidden="true" size={17} className="text-muted-foreground" />
      </summary>
      <div className="max-h-80 space-y-2 overflow-y-auto border-t border-border p-3">
        {exports.map((item) => {
          const completed = item.status === "completed" || item.status === "completed_with_warnings";
          const failed = item.status === "failed" || item.status === "canceled";
          return (
            <article key={item.id} className="rounded-xl bg-muted/60 p-3">
              <div className="flex items-start gap-2"><Archive aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="text-xs font-medium">ZIP mit <span className="tabular-nums">{item.totalItems}</span> Dokumenten</p><p className="mt-0.5 text-xs text-muted-foreground">{exportStatusLabel(item)}{item.outputSize ? ` · ${formatBytes(BigInt(item.outputSize))}` : ""}</p></div></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${item.progress}%` }} /></div>
              {item.error ? <p role="alert" className="mt-2 text-xs text-red-700">{item.error}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {completed ? <a href={`/api/document-exports/${item.id}/download`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground"><Download size={15} /> ZIP herunterladen</a> : null}
                {failed ? <button type="button" onClick={() => void retry(item.id)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-surface px-3 text-xs font-medium"><RotateCcw size={15} /> Wiederholen</button> : null}
                {completed || failed ? <button type="button" onClick={() => void dismiss(item.id)} aria-label="Export ausblenden" className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface text-muted-foreground hover:text-foreground"><X size={15} /></button> : null}
              </div>
            </article>
          );
        })}
        <p role="status" aria-live="polite" className={message ? "text-xs text-red-700" : "sr-only"}>{message || "Keine Exportmeldung"}</p>
      </div>
    </details>
  );
}

function exportStatusLabel(item: ExportItem) {
  if (item.status === "queued") return "Wartet auf Verarbeitung";
  if (item.status === "processing") return `Wird erstellt · ${item.progress}%`;
  if (item.status === "completed_with_warnings") return `Fertig · ${item.skippedItems} ausgelassen · 24 Stunden verfügbar`;
  if (item.status === "completed") return "Fertig · 24 Stunden verfügbar";
  if (item.status === "failed") return "Export fehlgeschlagen";
  if (item.status === "canceled") return "Export abgebrochen";
  return "Export abgelaufen";
}
