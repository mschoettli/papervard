"use client";

import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import { FileUp, RotateCw, Upload } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import {
  UploadManagerProvider,
  uploadStatusLabel,
  useOptionalUploadManager,
  useUploadManager
} from "@/components/upload-manager";

type FolderOption = {
  id: string;
  name: string;
  visibility: "private" | "family";
};

export function ResumableUpload({ accept, folders }: { accept: string; folders: FolderOption[] }) {
  const manager = useOptionalUploadManager();
  if (!manager) {
    return (
      <UploadManagerProvider>
        <ResumableUploadContent accept={accept} folders={folders} />
      </UploadManagerProvider>
    );
  }
  return <ResumableUploadContent accept={accept} folders={folders} />;
}

function ResumableUploadContent({ accept, folders }: { accept: string; folders: FolderOption[] }) {
  const {
    items,
    isUploading,
    message,
    selectFiles,
    updateItem,
    startUploads,
    submitPassword
  } = useUploadManager();
  const [isDragging, setIsDragging] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "family">("private");
  const [folderId, setFolderId] = useState("");
  const visibleFolders = useMemo(() => folders.filter((folder) => folder.visibility === visibility), [folders, visibility]);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectFiles(event.dataTransfer.files);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await startUploads({ visibility, folderId: folderId || undefined });
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
            isDragging ? "border-primary bg-primary/10" : "border-primary/40 bg-surface hover:bg-muted/40"
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
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base sm:text-sm"
          >
            <option value="private">Privat</option>
            <option value="family">Familie</option>
          </select>
        </div>
        <div>
          <label htmlFor="resumable-folder" className="block text-sm font-medium">Zielordner</label>
          <select id="resumable-folder" name="folderId" value={folderId} onChange={(event) => setFolderId(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base sm:text-sm">
            <option value="">Unsortiert</option>
            {visibleFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-2" aria-label="Ausgewählte Dateien">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 break-all font-medium">{item.file.name}</span>
                <span className="text-muted-foreground">{formatBytes(item.file.size)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Uploadfortschritt ${item.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress}>
                <div className="h-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${item.progress}%` }} />
              </div>
              <p className={item.error ? "mt-2 text-sm text-red-700 dark:text-red-300" : "mt-2 text-sm text-muted-foreground"} role={item.error ? "alert" : undefined}>
                {item.error ?? uploadStatusLabel(item.status)}
              </p>
              {item.status === "password" ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label className="min-w-0 flex-1"><span className="sr-only">Passwort für {item.file.name}</span><input type="password" autoComplete="off" value={item.password ?? ""} onChange={(event) => updateItem(item.id, { password: event.target.value })} className="min-h-11 w-full rounded-md border border-border bg-surface px-3" placeholder="Dateipasswort" /></label>
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
      <p className="text-xs text-muted-foreground">Nach dem Start kannst du in Papervard weiterarbeiten. Fortschritt und Verarbeitung bleiben unten rechts sichtbar.</p>
    </form>
  );
}
