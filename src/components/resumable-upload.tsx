"use client";

import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import { FileUp, RotateCw, Upload } from "lucide-react";
import { formatBytes } from "@/lib/utils";

type FolderOption = {
  id: string;
  name: string;
  visibility: "private" | "family";
};

type UploadItem = {
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

export function ResumableUpload({ accept, folders }: { accept: string; folders: FolderOption[] }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "family">("private");
  const [folderId, setFolderId] = useState("");
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const visibleFolders = useMemo(() => folders.filter((folder) => folder.visibility === visibility), [folders, visibility]);

  function updateItem(id: string, update: Partial<UploadItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  }

  function selectFiles(files: ArrayLike<File> | null) {
    if (!files) return;
    setItems(Array.from(files, (file) => ({
      id: createUploadItemId(),
      file,
      progress: 0,
      status: "ready" as const
    })));
    setMessage("");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectFiles(event.dataTransfer.files);
  }

  async function sessionFor(item: UploadItem): Promise<UploadSessionResponse> {
    const storageKey = resumeStorageKey(item.file);
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const existing = JSON.parse(saved) as UploadSessionResponse;
        const response = await fetch(`/api/uploads/${existing.id}`, {
          method: "HEAD",
          headers: { "Upload-Token": existing.resumeToken }
        });
        if (response.ok) {
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
        visibility,
        folderId: folderId || undefined
      })
    });
    const body = await response.json() as UploadSessionResponse & { message?: string };
    if (!response.ok) throw new Error(body.message ?? "Upload konnte nicht gestartet werden.");
    window.localStorage.setItem(storageKey, JSON.stringify(body));
    return body;
  }

  async function uploadItem(item: UploadItem) {
    updateItem(item.id, { status: "uploading", error: undefined });
    const session = await sessionFor(item);
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
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const response = await fetch(`/api/uploads/${session.id}`, { method: "HEAD", headers: { "Upload-Token": session.resumeToken } });
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
    void pollProcessing(item.id, item.file, { id: item.uploadId, resumeToken: item.resumeToken, offset: String(item.file.size), chunkBytes: 0 });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0) {
      setMessage("Bitte mindestens eine Datei auswählen.");
      return;
    }

    setIsUploading(true);
    setMessage("");
    let failures = 0;
    for (const item of items) {
      if (item.status === "completed") continue;
      try {
        await uploadItem(item);
      } catch (error) {
        failures += 1;
        updateItem(item.id, { status: "failed", error: error instanceof Error ? error.message : "Upload fehlgeschlagen." });
      }
    }
    setIsUploading(false);
    setMessage(failures > 0 ? `${failures} Uploads warten auf einen erneuten Versuch.` : "Alle Dateien wurden übertragen und zur Verarbeitung eingereiht.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="resumable-files" className="block text-sm font-medium">Dateien auswählen</label>
        <label
          htmlFor="resumable-files"
          data-upload-dropzone
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
          }}
          onDrop={handleDrop}
          className={`mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors ${
            isDragging ? "border-primary bg-primary/10" : "border-primary/40 bg-white hover:bg-muted/40"
          }`}
        >
          <FileUp aria-hidden="true" size={24} />
          <span className="mt-2 text-sm font-medium">Dokumente, Bilder, E-Mails, E-Books oder DICOM</span>
          <span className="mt-1 text-sm text-muted-foreground">Auswählen oder hierher ziehen · Mehrfachauswahl möglich · Keine feste Dateigrößengrenze</span>
        </label>
        <input id="resumable-files" type="file" multiple accept={accept} className="sr-only" onChange={(event) => selectFiles(event.target.files)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="resumable-visibility" className="block text-sm font-medium">Bereich</label>
          <select
            id="resumable-visibility"
            name="visibility"
            value={visibility}
            onChange={(event) => {
              setVisibility(event.target.value as "private" | "family");
              setFolderId("");
            }}
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-white px-3 text-base sm:text-sm"
          >
            <option value="private">Privat</option>
            <option value="family">Familie</option>
          </select>
        </div>
        <div>
          <label htmlFor="resumable-folder" className="block text-sm font-medium">Zielordner</label>
          <select id="resumable-folder" name="folderId" value={folderId} onChange={(event) => setFolderId(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-border bg-white px-3 text-base sm:text-sm">
            <option value="">Unsortiert</option>
            {visibleFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-2" aria-label="Ausgewählte Dateien">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-border bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 break-all font-medium">{item.file.name}</span>
                <span className="text-muted-foreground">{formatBytes(item.file.size)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Uploadfortschritt ${item.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress}>
                <div className="h-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${item.progress}%` }} />
              </div>
              <p className={item.error ? "mt-2 text-sm text-red-700" : "mt-2 text-sm text-muted-foreground"} role={item.error ? "alert" : undefined}>
                {item.error ?? uploadStatusLabel(item.status)}
              </p>
              {item.status === "password" ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label className="min-w-0 flex-1"><span className="sr-only">Passwort für {item.file.name}</span><input type="password" autoComplete="off" value={item.password ?? ""} onChange={(event) => updateItem(item.id, { password: event.target.value })} className="min-h-11 w-full rounded-md border border-border px-3" placeholder="Dateipasswort" /></label>
                  <button type="button" onClick={() => void submitPassword(item)} className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Entsperren</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="submit" disabled={isUploading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-wait disabled:opacity-60">
          {items.some((item) => item.status === "failed") ? <RotateCw aria-hidden="true" size={18} /> : <Upload aria-hidden="true" size={18} />}
          {isUploading ? "Wird übertragen …" : items.some((item) => item.status === "failed") ? "Erneut versuchen" : "Upload starten"}
        </button>
        <p className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">{message}</p>
      </div>
    </form>
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

function uploadStatusLabel(status: UploadItem["status"]) {
  const labels: Record<UploadItem["status"], string> = {
    ready: "Bereit",
    uploading: "Wird übertragen",
    processing: "Übertragen · Verarbeitung startet",
    password: "Passwort erforderlich",
    completed: "Übertragen",
    failed: "Unterbrochen"
  };
  return labels[status];
}
