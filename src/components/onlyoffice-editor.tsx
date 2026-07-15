"use client";

import Script from "next/script";
import { useEffect, useId, useRef, useState } from "react";

type OnlyOfficeEditorProps = {
  serverUrl: string;
  config: Record<string, unknown>;
};

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (elementId: string, config: Record<string, unknown>) => { destroyEditor?: () => void } };
  }
}

export function OnlyOfficeEditor({ serverUrl, config }: OnlyOfficeEditorProps) {
  const reactId = useId();
  const elementId = `onlyoffice-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const editor = useRef<{ destroyEditor?: () => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !window.DocsAPI) return;
    try {
      editor.current = new window.DocsAPI.DocEditor(elementId, config);
      return () => editor.current?.destroyEditor?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Editor konnte nicht gestartet werden.");
    }
  }, [config, elementId, ready]);

  return (
    <div className="relative min-h-[70vh] overflow-hidden rounded-lg border border-border bg-white">
      <Script
        src={`${serverUrl.replace(/\/$/, "")}/web-apps/apps/api/documents/api.js`}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
        onError={() => setError("Der lokale ONLYOFFICE-Dienst ist nicht erreichbar.")}
      />
      {!ready && !error ? <p className="p-5 text-sm text-muted-foreground" role="status">Lokaler Editor wird geladen …</p> : null}
      {error ? <p className="m-5 rounded-md bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p> : null}
      <div id={elementId} className="h-[calc(100vh-12rem)] min-h-[680px] w-full" />
    </div>
  );
}
