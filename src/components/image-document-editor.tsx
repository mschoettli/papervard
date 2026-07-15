"use client";

import { useState } from "react";

type Operation = { rotate?: 90 | 180 | 270; flipHorizontal?: boolean; flipVertical?: boolean };

export function ImageDocumentEditor({ documentId, title, baseVersionId }: { documentId: string; title: string; baseVersionId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [baseVersion, setBaseVersion] = useState(baseVersionId);

  async function apply(operation: Operation) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${documentId}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...operation, baseVersionId: baseVersion })
      });
      const payload = await response.json() as { message?: string; versionId?: string; versionNumber?: number; conflict?: boolean };
      if (!response.ok) throw new Error(payload.message ?? "Bild konnte nicht gespeichert werden.");
      if (payload.conflict) {
        setMessage(`Als Konfliktversion ${payload.versionNumber} gesichert. Das aktuellere Bild wurde nicht überschrieben.`);
      } else {
        if (payload.versionId) setBaseVersion(payload.versionId);
        setRevision((value) => value + 1);
        setMessage(`Als Version ${payload.versionNumber} gespeichert. Das Original bleibt in der Versionshistorie erhalten.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bild konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex flex-wrap gap-2 border-b border-border p-3" role="toolbar" aria-label="Bild bearbeiten">
        <EditButton disabled={busy} onClick={() => apply({ rotate: 270 })}>Links drehen</EditButton>
        <EditButton disabled={busy} onClick={() => apply({ rotate: 90 })}>Rechts drehen</EditButton>
        <EditButton disabled={busy} onClick={() => apply({ rotate: 180 })}>180° drehen</EditButton>
        <EditButton disabled={busy} onClick={() => apply({ flipHorizontal: true })}>Horizontal spiegeln</EditButton>
        <EditButton disabled={busy} onClick={() => apply({ flipVertical: true })}>Vertikal spiegeln</EditButton>
      </div>
      {message ? <p role="status" className="border-b border-border bg-muted px-4 py-2 text-sm">{message}</p> : null}
      <div className="flex min-h-[70vh] items-center justify-center bg-neutral-950 p-4">
        <img key={revision} src={`/api/documents/${documentId}/file?v=${revision}`} alt={title} className="max-h-[76vh] max-w-full object-contain" />
      </div>
    </section>
  );
}

function EditButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="min-h-11 rounded-md bg-muted px-4 text-sm font-medium hover:bg-border disabled:opacity-50" {...props}>{children}</button>;
}
