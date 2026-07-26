"use client";

import { ChevronUp, CircleCheck, FileUp, KeyRound, LoaderCircle, X } from "lucide-react";
import {
  createContext,
  useContext,
  useState,
  type ReactNode
} from "react";
import { formatBytes } from "@/lib/utils";

export type UploadItem = {
  id: string;
  file: File;
  progress: number;
  status: "ready" | "uploading" | "processing" | "password" | "completed" | "failed";
  error?: string;
  uploadId?: string;
  resumeToken?: string;
  password?: string;
};

type UploadSessionResponse = {
  id: string;
  resumeToken: string;
  offset: string;
  chunkBytes: number;
};

type UploadDestination = {
  visibility: "private" | "family";
  folderId?: string;
};

type UploadManagerValue = {
  items: UploadItem[];
  isUploading: boolean;
  message: string;
  selectFiles: (files: ArrayLike<File> | null) => void;
  updateItem: (id: string, update: Partial<UploadItem>) => void;
  startUploads: (destination: UploadDestination) => Promise<void>;
  submitPassword: (item: UploadItem) => Promise<void>;
  dismissCompleted: () => void;
};

const UploadManagerContext = createContext<UploadManagerValue | null>(null);

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");

  function updateItem(id: string, update: Partial<UploadItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  }

  function selectFiles(files: ArrayLike<File> | null) {
    if (!files) return;
    const selected = Array.from(files, (file) => ({
      id: createUploadItemId(),
      file,
      progress: 0,
      status: "ready" as const
    }));
    setItems((current) => [
      ...current.filter((item) => !["ready", "failed", "completed"].includes(item.status)),
      ...selected
    ]);
    setMessage("");
  }

  async function sessionFor(item: UploadItem, destination: UploadDestination): Promise<UploadSessionResponse> {
    const storageKey = resumeStorageKey(item.file);
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const existing = JSON.parse(saved) as UploadSessionResponse;
        const response = await fetch(`/api/uploads/${existing.id}`, {
          method: "HEAD",
          headers: { "Upload-Token": existing.resumeToken }
        });
        const status = response.headers.get("Upload-Status");
        if (response.ok && status !== "failed" && status !== "canceled") {
          return { ...existing, offset: response.headers.get("Upload-Offset") ?? existing.offset };
        }
      } catch {
        // A malformed or expired local record is replaced with a fresh session.
      }
      window.localStorage.removeItem(storageKey);
    }

    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalName: item.file.name,
        mimeType: item.file.type || "application/octet-stream",
        size: String(item.file.size),
        visibility: destination.visibility,
        folderId: destination.folderId || undefined
      })
    });
    const body = await response.json() as UploadSessionResponse & { message?: string };
    if (!response.ok) throw new Error(body.message ?? "Upload konnte nicht gestartet werden.");
    window.localStorage.setItem(storageKey, JSON.stringify(body));
    return body;
  }

  async function uploadItem(item: UploadItem, destination: UploadDestination) {
    updateItem(item.id, { status: "uploading", error: undefined });
    const session = await sessionFor(item, destination);
    updateItem(item.id, { uploadId: session.id, resumeToken: session.resumeToken });
    let offset = Number(session.offset);

    while (offset < item.file.size) {
      const chunk = item.file.slice(offset, Math.min(offset + session.chunkBytes, item.file.size));
      const response = await fetch(`/api/uploads/${session.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/offset+octet-stream",
          "Upload-Token": session.resumeToken,
          "Upload-Offset": String(offset)
        },
        body: chunk
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: "Upload unterbrochen." })) as { message?: string };
        throw new Error(body.message ?? "Upload unterbrochen.");
      }
      offset = Number(response.headers.get("Upload-Offset") ?? offset + chunk.size);
      session.offset = String(offset);
      window.localStorage.setItem(resumeStorageKey(item.file), JSON.stringify(session));
      updateItem(item.id, { progress: Math.min(85, Math.round((offset / item.file.size) * 85)) });
    }

    updateItem(item.id, { status: "processing", progress: 85 });
    const complete = await fetch(`/api/uploads/${session.id}`, {
      method: "POST",
      headers: { "Upload-Token": session.resumeToken }
    });
    if (!complete.ok) {
      const body = await complete.json().catch(() => ({ message: "Verarbeitung konnte nicht gestartet werden." })) as { message?: string };
      throw new Error(body.message ?? "Verarbeitung konnte nicht gestartet werden.");
    }
    void pollProcessing(item.id, item.file, session);
  }

  async function pollProcessing(itemId: string, file: File, session: UploadSessionResponse) {
    while (true) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      const response = await fetch(`/api/uploads/${session.id}`, {
        method: "HEAD",
        headers: { "Upload-Token": session.resumeToken }
      });
      if (!response.ok) {
        updateItem(itemId, { status: "failed", error: "Verarbeitungsstatus ist nicht mehr verfügbar." });
        return;
      }
      const status = response.headers.get("Upload-Status") ?? "processing";
      const processingProgress = Number(response.headers.get("Upload-Progress") ?? 0);
      const progress = Math.min(99, 85 + Math.round(processingProgress * 0.14));
      if (status === "completed") {
        window.localStorage.removeItem(resumeStorageKey(file));
        updateItem(itemId, { status: "completed", progress: 100, error: undefined });
        return;
      }
      const encodedError = response.headers.get("Upload-Error");
      const processingError = encodedError ? decodeURIComponent(encodedError) : undefined;
      if (status === "awaiting_password") {
        updateItem(itemId, { status: "password", progress, error: processingError ?? "Passwort erforderlich." });
        return;
      }
      if (status === "failed") {
        updateItem(itemId, { status: "failed", progress, error: processingError ?? "Verarbeitung fehlgeschlagen." });
        return;
      }
      updateItem(itemId, { status: "processing", progress, error: undefined });
    }
  }

  async function submitPassword(item: UploadItem) {
    if (!item.uploadId || !item.resumeToken || !item.password) return;
    updateItem(item.id, { status: "processing", error: undefined });
    const response = await fetch(`/api/uploads/${item.uploadId}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Upload-Token": item.resumeToken },
      body: JSON.stringify({ password: item.password })
    });
    const body = await response.json().catch(() => ({})) as { message?: string };
    updateItem(item.id, { password: "" });
    if (!response.ok) {
      updateItem(item.id, { status: "password", error: body.message ?? "Passwort ist falsch." });
      return;
    }
    void pollProcessing(item.id, item.file, {
      id: item.uploadId,
      resumeToken: item.resumeToken,
      offset: String(item.file.size),
      chunkBytes: 0
    });
  }

  async function startUploads(destination: UploadDestination) {
    if (items.length === 0) {
      setMessage("Bitte mindestens eine Datei auswählen.");
      return;
    }
    setIsUploading(true);
    setMessage("");
    let failures = 0;
    for (const item of items) {
      if (item.status === "completed" || item.status === "processing" || item.status === "password") continue;
      try {
        await uploadItem(item, destination);
      } catch (error) {
        failures += 1;
        updateItem(item.id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Upload fehlgeschlagen."
        });
      }
    }
    setIsUploading(false);
    setMessage(failures > 0
      ? `${failures} Uploads warten auf einen erneuten Versuch.`
      : "Dateien übertragen. Die Verarbeitung läuft im Hintergrund weiter.");
  }

  const value: UploadManagerValue = {
    items,
    isUploading,
    message,
    selectFiles,
    updateItem,
    startUploads,
    submitPassword,
    dismissCompleted: () => setItems((current) => current.filter((item) => item.status !== "completed"))
  };

  return <UploadManagerContext.Provider value={value}>{children}</UploadManagerContext.Provider>;
}

export function useUploadManager() {
  const value = useContext(UploadManagerContext);
  if (!value) throw new Error("Upload-Komponenten müssen innerhalb des UploadManagerProvider verwendet werden.");
  return value;
}

export function useOptionalUploadManager() {
  return useContext(UploadManagerContext);
}

export function UploadStatusDock() {
  const { items, updateItem, submitPassword, dismissCompleted } = useUploadManager();
  if (items.length === 0) return null;
  const active = items.filter((item) => item.status !== "completed").length;
  const completed = items.length - active;
  const overallProgress = Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length);

  return (
    <details className="fixed bottom-4 right-4 z-40 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" open={active > 0}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
        {active > 0 ? <LoaderCircle aria-hidden="true" size={19} className="animate-spin text-primary motion-reduce:animate-none" /> : <CircleCheck aria-hidden="true" size={19} className="text-primary" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{active > 0 ? "Upload und Verarbeitung laufen" : "Uploads abgeschlossen"}</span>
          <span className="block text-xs text-muted-foreground">{items.length} Dateien · {overallProgress}%</span>
        </span>
        <ChevronUp aria-hidden="true" size={17} className="text-muted-foreground" />
      </summary>
      <div className="max-h-72 space-y-2 overflow-y-auto border-t border-border p-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl bg-muted/60 p-3">
            <div className="flex items-start gap-2">
              <FileUp aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{item.file.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.error ?? uploadStatusLabel(item.status)} · {formatBytes(item.file.size)}</p>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${item.progress}%` }} />
            </div>
            {item.status === "password" ? (
              <div className="mt-2 flex gap-2">
                <input type="password" value={item.password ?? ""} onChange={(event) => updateItem(item.id, { password: event.target.value })} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-xs" placeholder="Dateipasswort" />
                <button type="button" onClick={() => void submitPassword(item)} className="flex h-10 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground"><KeyRound size={14} /> Entsperren</button>
              </div>
            ) : null}
          </article>
        ))}
        {completed > 0 ? (
          <button type="button" onClick={dismissCompleted} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <X aria-hidden="true" size={14} /> Abgeschlossene ausblenden
          </button>
        ) : null}
      </div>
    </details>
  );
}

function resumeStorageKey(file: File) {
  return `papervard-upload:${file.name}:${file.size}:${file.lastModified}`;
}

let uploadItemSequence = 0;

function createUploadItemId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  uploadItemSequence += 1;
  return `upload-${Date.now().toString(36)}-${uploadItemSequence.toString(36)}`;
}

export function uploadStatusLabel(status: UploadItem["status"]) {
  const labels: Record<UploadItem["status"], string> = {
    ready: "Bereit",
    uploading: "Wird übertragen",
    processing: "Wird im Hintergrund verarbeitet",
    password: "Passwort erforderlich",
    completed: "Verarbeitung abgeschlossen",
    failed: "Unterbrochen"
  };
  return labels[status];
}
