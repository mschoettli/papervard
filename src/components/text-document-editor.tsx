"use client";

import { useEffect, useState } from "react";

export function TextDocumentEditor({ documentId, title, baseVersionId }: { documentId: string; title: string; baseVersionId: string }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [baseVersion, setBaseVersion] = useState(baseVersionId);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/documents/${documentId}/file`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Text konnte nicht geladen werden.");
        setContent(await response.text());
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setMessage(error.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [documentId]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${documentId}/text`, {
        method: "PUT",
        headers: { "Content-Type": "text/plain; charset=utf-8", "Papervard-Base-Version": baseVersion },
        body: content
      });
      const payload = await response.json() as { message?: string; versionId?: string; versionNumber?: number; conflict?: boolean };
      if (!response.ok) throw new Error(payload.message ?? "Text konnte nicht gespeichert werden.");
      if (payload.conflict) {
        setMessage(`Als Konfliktversion ${payload.versionNumber} gesichert. Eine neuere Version war bereits aktuell; bitte Versionsverlauf prüfen.`);
      } else {
        if (payload.versionId) setBaseVersion(payload.versionId);
        setMessage(`Als Version ${payload.versionNumber} gespeichert.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Text konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">UTF-8-Texteditor · jede Speicherung erzeugt eine neue Inhaltsversion</p>
        <button type="button" onClick={save} disabled={loading || saving} className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {saving ? "Speichert …" : "Neue Version speichern"}
        </button>
      </div>
      {message ? <p role="status" className="border-b border-border bg-muted px-4 py-2 text-sm">{message}</p> : null}
      <label className="sr-only" htmlFor="text-document-content">Inhalt von {title}</label>
      <textarea id="text-document-content" value={content} onChange={(event) => setContent(event.target.value)} disabled={loading} spellCheck className="min-h-[70vh] w-full resize-y p-4 font-mono text-sm leading-6 outline-none" />
    </section>
  );
}
