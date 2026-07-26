"use client";

import { MoreHorizontal, Plus, Tags, Trash2, X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { FOLDER_ICON_OPTIONS, FolderGlyph } from "@/components/folder-icon";

type ServerFormAction = (formData: FormData) => void | Promise<void>;

type TagOption = {
  id: string;
  name: string;
  color: string;
  _count?: { documents: number };
};

type FolderOption = {
  id: string;
  name: string;
  parentId: string | null;
  visibility: "private" | "family";
};

function DialogShell({
  dialogRef,
  title,
  description,
  children
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="m-auto max-h-[min(88dvh,760px)] w-[min(92vw,680px)] overflow-hidden rounded-2xl border border-border bg-surface p-0 shadow-2xl"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 id={titleId} className="font-display text-xl font-semibold">{title}</h2>
          {description ? <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Dialog schließen" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
          <X aria-hidden="true" size={19} />
        </button>
      </div>
      <div className="max-h-[calc(88dvh-5rem)] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

function IconSelect({ defaultValue = "folder", id }: { defaultValue?: string; id?: string }) {
  return (
    <select id={id} name="icon" defaultValue={defaultValue} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm">
      {FOLDER_ICON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function FolderParentSelect({
  folders,
  defaultValue,
  excludedId
}: {
  folders: FolderOption[];
  defaultValue?: string | null;
  excludedId?: string;
}) {
  return (
    <select name="targetFolderId" defaultValue={defaultValue ?? ""} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm">
      <option value="">Oberste Ebene</option>
      {folders
        .filter((folder) => folder.id !== excludedId)
        .map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.visibility === "private" ? "Privat" : "Familie"} · {folder.name}
          </option>
        ))}
    </select>
  );
}

export function CreateFolderModal({
  folders,
  defaultParentId,
  defaultVisibility,
  createAction
}: {
  folders: FolderOption[];
  defaultParentId?: string;
  defaultVisibility: "private" | "family";
  createAction: ServerFormAction;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
        <Plus aria-hidden="true" size={17} /> Neuer Ordner
      </button>
      <DialogShell dialogRef={dialogRef} title="Neuen Ordner erstellen" description="Name, Symbol und Ablagebereich lassen sich später jederzeit ändern.">
        <form action={createAction} onSubmit={() => dialogRef.current?.close()} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Name
            <input name="name" required maxLength={80} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3" placeholder="Zum Beispiel Versicherungen" />
          </label>
          <label className="text-sm font-medium">Icon
            <span className="mt-1 block"><IconSelect /></span>
          </label>
          <label className="text-sm font-medium">Sichtbarkeit
            <select name="visibility" defaultValue={defaultVisibility} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3">
              <option value="private">Nur ich</option>
              <option value="family">Familie</option>
            </select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">Übergeordneter Ordner
            <select name="parentId" defaultValue={defaultParentId ?? ""} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3">
              <option value="">Oberste Ebene</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.visibility === "private" ? "Privat" : "Familie"} · {folder.name}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="min-h-11 rounded-lg px-4 text-sm font-medium hover:bg-muted">Abbrechen</button>
            <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Ordner erstellen</button>
          </div>
        </form>
      </DialogShell>
    </>
  );
}

export function TagManagerModal({
  tags,
  createAction,
  updateAction,
  mergeAction,
  deleteAction
}: {
  tags: TagOption[];
  createAction: ServerFormAction;
  updateAction: ServerFormAction;
  mergeAction: ServerFormAction;
  deleteAction: ServerFormAction;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium hover:bg-muted" aria-haspopup="dialog">
        <Tags aria-hidden="true" size={17} /> Tags verwalten
      </button>
      <DialogShell dialogRef={dialogRef} title="Tag-Sammlung verwalten" description="Tags werden hier zentral erstellt. Bei Dokumenten wählst du anschließend nur noch aus dieser Sammlung.">
        <form action={createAction} onSubmit={() => dialogRef.current?.close()} className="grid grid-cols-[44px_1fr_auto] gap-2">
          <label className="sr-only" htmlFor="modal-new-tag-color">Tag-Farbe</label>
          <input id="modal-new-tag-color" name="color" type="color" defaultValue="#a8472a" className="h-11 w-11 rounded-lg border border-border bg-surface p-1" />
          <label className="sr-only" htmlFor="modal-new-tag-name">Tag-Name</label>
          <input id="modal-new-tag-name" name="name" required maxLength={60} placeholder="Neues Tag" className="h-11 min-w-0 rounded-lg border border-border bg-surface px-3 text-sm" />
          <button aria-label="Tag erstellen" className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"><Plus size={18} /> <span className="hidden sm:inline">Erstellen</span></button>
        </form>
        <div className="mt-5 space-y-2">
          {tags.map((tag) => (
            <details key={tag.id} className="rounded-xl bg-muted/70">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 text-sm [&::-webkit-details-marker]:hidden">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="min-w-0 flex-1 truncate font-medium">{tag.name}</span>
                <span className="tabular-nums text-xs text-muted-foreground">{tag._count?.documents ?? 0} Dokumente</span>
              </summary>
              <div className="grid gap-3 border-t border-border/70 p-3">
                <form action={updateAction} onSubmit={() => dialogRef.current?.close()} className="grid gap-2 sm:grid-cols-[44px_1fr_auto]">
                  <input type="hidden" name="tagId" value={tag.id} />
                  <input aria-label={`Farbe für ${tag.name}`} name="color" type="color" defaultValue={tag.color} className="h-10 w-11 rounded-lg border border-border bg-surface p-1" />
                  <input aria-label={`${tag.name} umbenennen`} name="name" defaultValue={tag.name} required maxLength={60} className="h-10 min-w-0 rounded-lg border border-border bg-surface px-3 text-sm" />
                  <button className="min-h-10 rounded-lg bg-surface px-3 text-xs font-medium shadow-sm hover:bg-muted">Speichern</button>
                </form>
                {tags.length > 1 ? (
                  <form action={mergeAction} onSubmit={() => dialogRef.current?.close()} className="flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="sourceTagId" value={tag.id} />
                    <select aria-label={`${tag.name} zusammenführen mit`} name="targetTagId" className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs">
                      {tags.filter((item) => item.id !== tag.id).map((item) => <option key={item.id} value={item.id}>Mit „{item.name}“ zusammenführen</option>)}
                    </select>
                    <button className="min-h-10 rounded-lg bg-surface px-3 text-xs font-medium shadow-sm hover:bg-muted">Zusammenführen</button>
                  </form>
                ) : null}
                <form action={deleteAction} onSubmit={() => dialogRef.current?.close()}>
                  <input type="hidden" name="tagId" value={tag.id} />
                  <ConfirmSubmitButton message={`Tag „${tag.name}“ wirklich löschen? Die Dokumente bleiben erhalten.`} className="w-full bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-200">Tag löschen</ConfirmSubmitButton>
                </form>
              </div>
            </details>
          ))}
          {tags.length === 0 ? <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Die Tag-Sammlung ist noch leer.</p> : null}
        </div>
      </DialogShell>
    </>
  );
}

export function TagSelectionModal({
  subjectId,
  subjectName,
  subjectType,
  tags,
  selectedTagIds,
  updateAction,
  compact = false
}: {
  subjectId: string;
  subjectName: string;
  subjectType: "document" | "folder";
  tags: TagOption[];
  selectedTagIds: string[];
  updateAction: ServerFormAction;
  compact?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const idField = subjectType === "document" ? "documentId" : "folderId";
  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium hover:bg-muted ${compact ? "min-h-10 px-3 text-xs" : "min-h-11 px-4 text-sm"}`} aria-haspopup="dialog">
        <Tags aria-hidden="true" size={16} /> Tags auswählen
      </button>
      <DialogShell dialogRef={dialogRef} title="Tags auswählen" description={`Auswahl für „${subjectName}“. Neue Tags legst du in der Tag-Sammlung an.`}>
        <form action={updateAction} onSubmit={() => dialogRef.current?.close()}>
          <input type="hidden" name={idField} value={subjectId} />
          <fieldset>
            <legend className="sr-only">Verfügbare Tags</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {tags.map((tag) => (
                <label key={tag.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm hover:bg-muted">
                  <input type="checkbox" name="tagId" value={tag.id} defaultChecked={selectedTagIds.includes(tag.id)} />
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="min-w-0 truncate">{tag.name}</span>
                </label>
              ))}
            </div>
            {tags.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Lege zuerst Tags in der Tag-Sammlung an.</p> : null}
          </fieldset>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="min-h-11 rounded-lg px-4 text-sm font-medium hover:bg-muted">Abbrechen</button>
            <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Auswahl speichern</button>
          </div>
        </form>
      </DialogShell>
    </>
  );
}

export function FolderActionsMenu({
  folder,
  folders,
  renameAction,
  moveAction,
  trashAction
}: {
  folder: FolderOption & { icon: string };
  folders: FolderOption[];
  renameAction: ServerFormAction;
  moveAction: ServerFormAction;
  trashAction: ServerFormAction;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <details className="relative">
        <summary aria-label={`${folder.name} verwalten`} className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
          <MoreHorizontal aria-hidden="true" size={19} />
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
          <button type="button" onClick={() => dialogRef.current?.showModal()} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted">
            <FolderGlyph icon={folder.icon} size={16} /> Ordner bearbeiten
          </button>
          <form action={trashAction}>
            <input type="hidden" name="folderId" value={folder.id} />
            <ConfirmSubmitButton message={`Ordner „${folder.name}“ in den Papierkorb verschieben?`} className="w-full justify-start text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40">
              <Trash2 aria-hidden="true" size={16} /> Löschen
            </ConfirmSubmitButton>
          </form>
        </div>
      </details>
      <DialogShell dialogRef={dialogRef} title="Ordner bearbeiten" description="Ändere Name, Icon oder Position des Ordners.">
        <div className="grid gap-5">
          <form action={renameAction} onSubmit={() => dialogRef.current?.close()} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="folderId" value={folder.id} />
            <label className="text-sm font-medium">Name
              <input name="name" defaultValue={folder.name} required maxLength={80} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3" />
            </label>
            <label className="text-sm font-medium">Icon
              <span className="mt-1 block"><IconSelect defaultValue={folder.icon} /></span>
            </label>
            <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground sm:col-span-2">Änderungen speichern</button>
          </form>
          <form action={moveAction} onSubmit={() => dialogRef.current?.close()} className="border-t border-border pt-5">
            <input type="hidden" name="folderId" value={folder.id} />
            <label className="text-sm font-medium">Übergeordneter Ordner
              <span className="mt-1 block"><FolderParentSelect folders={folders.filter((item) => item.visibility === folder.visibility)} defaultValue={folder.parentId} excludedId={folder.id} /></span>
            </label>
            <button className="mt-3 min-h-11 w-full rounded-lg bg-muted px-4 text-sm font-medium">Ordner verschieben</button>
          </form>
        </div>
      </DialogShell>
    </>
  );
}
