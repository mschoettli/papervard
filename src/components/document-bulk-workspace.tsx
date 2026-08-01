"use client";

import {
  CheckSquare2,
  Download,
  FolderInput,
  Tags,
  Trash2,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  initialBulkSelection,
  isDocumentSelected,
  reduceBulkSelection,
  selectedDocumentCount,
  type BulkSelectionState
} from "@/components/document-bulk-state";

type QuerySelection = {
  mode: "query";
  query?: string;
  folderId?: string;
  scope: "all" | "mine" | "family" | "favorites";
  year?: number;
  tagIds: string[];
  excludeIds: string[];
};

type VisibleDocument = { id: string; visibility: "private" | "family" };
type FolderOption = { id: string; name: string; visibility: "private" | "family" };
type TagOption = { id: string; name: string; color: string };

type BulkContextValue = {
  state: BulkSelectionState;
  active: boolean;
  toggle: (documentId: string) => void;
};

const BulkContext = createContext<BulkContextValue | null>(null);

export function DocumentBulkWorkspace({
  visibleDocuments,
  total,
  querySelection,
  folders,
  tags,
  selectionContextKey,
  children
}: {
  visibleDocuments: VisibleDocument[];
  total: number;
  querySelection: QuerySelection;
  folders: FolderOption[];
  tags: TagOption[];
  selectionContextKey?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reduceBulkSelection, initialBulkSelection);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const currentSelectionContext = selectionContextKey ?? JSON.stringify(querySelection);
  const previousSelectionContext = useRef(currentSelectionContext);
  const moveDialog = useRef<HTMLDialogElement>(null);
  const tagsDialog = useRef<HTMLDialogElement>(null);
  const trashDialog = useRef<HTMLDialogElement>(null);
  const count = selectedDocumentCount(state, total);
  const active = count > 0;
  const selectedVisible = visibleDocuments.filter((document) => isDocumentSelected(state, document.id));
  const selectedVisibilities = new Set(selectedVisible.map((document) => document.visibility));
  const mixedVisibility = selectedVisibilities.size > 1;
  const selection = state.allResults
    ? { ...querySelection, excludeIds: state.excludedIds }
    : { mode: "explicit" as const, ids: state.selectedIds };

  useEffect(() => {
    if (previousSelectionContext.current === currentSelectionContext) return;
    previousSelectionContext.current = currentSelectionContext;
    dispatch({ type: "clear" });
    moveDialog.current?.close();
    tagsDialog.current?.close();
    trashDialog.current?.close();
  }, [currentSelectionContext]);

  async function runBulk(action: "move" | "add-tags" | "remove-tags" | "trash", payload: Record<string, unknown> = {}) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/documents/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, selection, ...payload })
      });
      const result = await response.json() as { message?: string; total?: number; processed?: number; skipped?: number };
      if (!response.ok) throw new Error(result.message ?? "Mehrfachaktion fehlgeschlagen.");
      const skipped = result.skipped ?? 0;
      setMessage(`${result.processed ?? 0} Dokumente bearbeitet${skipped > 0 ? `, ${skipped} ausgelassen` : ""}.`);
      dispatch({ type: "clear" });
      closeDialogs();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mehrfachaktion fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  }

  async function startExport() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/document-exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection })
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Export konnte nicht gestartet werden.");
      setMessage(`ZIP-Export für ${count} Dokumente wurde gestartet.`);
      dispatch({ type: "clear" });
      window.dispatchEvent(new Event("papervard:export-created"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export konnte nicht gestartet werden.");
    } finally {
      setPending(false);
    }
  }

  function closeDialogs() {
    moveDialog.current?.close();
    tagsDialog.current?.close();
    trashDialog.current?.close();
  }

  return (
    <BulkContext.Provider value={{ state, active, toggle: (documentId) => dispatch({ type: "toggle", id: documentId }) }}>
      <section className="space-y-3">
        {visibleDocuments.length > 0 ? (
          <div className={`flex min-h-12 flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-[background-color,box-shadow] ${active ? "bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)]" : "bg-surface shadow-sm"}`}>
            <button
              type="button"
              onClick={() => dispatch({ type: "select-visible", ids: visibleDocuments.map((document) => document.id) })}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-medium transition-[background-color,transform] hover:bg-muted active:scale-[0.96]"
            >
              <CheckSquare2 aria-hidden="true" size={18} /> Sichtbare auswählen
            </button>
            {active ? (
              <>
                <span aria-live="polite" className="tabular-nums font-semibold text-foreground">{count} ausgewählt</span>
                {!state.allResults && total > state.selectedIds.length ? (
                  <button type="button" onClick={() => dispatch({ type: "select-all-results" })} className="min-h-11 rounded-xl px-3 font-medium text-primary hover:bg-primary/10">
                    Alle {total} Treffer auswählen
                  </button>
                ) : state.allResults ? <span className="text-muted-foreground">Alle Treffer dieser Ansicht</span> : null}
                {mixedVisibility ? <span className="text-xs text-muted-foreground">Private und gemeinsame Dokumente bitte getrennt verschieben.</span> : null}
                <button type="button" onClick={() => dispatch({ type: "clear" })} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X aria-hidden="true" size={17} /> Aufheben
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {children}
        <p role="status" aria-live="polite" className={`${message ? "block" : "sr-only"} rounded-xl bg-surface px-4 py-3 text-sm shadow-sm`}>{message || "Keine Statusmeldung"}</p>
        <span className="sr-only">Mehrfachaktionen: Verschieben, Tags, ZIP, Papierkorb</span>

        {active ? (
          <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto flex w-auto max-w-3xl flex-wrap items-center justify-center gap-1 rounded-2xl border border-border bg-surface p-2 shadow-[0_18px_60px_rgba(20,24,28,0.22)] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
            <span className="hidden px-3 text-sm font-semibold tabular-nums sm:inline">{count} ausgewählt</span>
            <BulkButton icon={<FolderInput size={17} />} onClick={() => moveDialog.current?.showModal()} disabled={pending || mixedVisibility}>Verschieben</BulkButton>
            <BulkButton icon={<Tags size={17} />} onClick={() => tagsDialog.current?.showModal()} disabled={pending}>Tags</BulkButton>
            <BulkButton icon={<Download size={17} />} onClick={() => void startExport()} disabled={pending}>ZIP</BulkButton>
            <BulkButton destructive icon={<Trash2 size={17} />} onClick={() => trashDialog.current?.showModal()} disabled={pending}>Papierkorb</BulkButton>
          </div>
        ) : null}

        <MoveDialog dialogRef={moveDialog} folders={folders} selectedVisibilities={selectedVisibilities} count={count} disabled={pending || mixedVisibility} onSubmit={(targetFolderId) => void runBulk("move", { targetFolderId })} />
        <TagsDialog dialogRef={tagsDialog} tags={tags} count={count} disabled={pending} onSubmit={(action, tagIds) => void runBulk(action, { tagIds })} />
        <ConfirmTrashDialog dialogRef={trashDialog} count={count} disabled={pending} onConfirm={() => void runBulk("trash")} />
      </section>
    </BulkContext.Provider>
  );
}

export function DocumentSelectionCheckbox({ documentId, title }: { documentId: string; title: string }) {
  const context = useContext(BulkContext);
  if (!context) return null;
  const checked = isDocumentSelected(context.state, documentId);
  return (
    <label
      className={`absolute left-2 top-2 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-surface/95 shadow-md transition-[opacity,transform] active:scale-[0.96] ${context.active || checked ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"}`}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="sr-only">{title} auswählen</span>
      <input type="checkbox" checked={checked} onChange={() => context.toggle(documentId)} className="h-[22px] w-[22px] accent-primary" />
    </label>
  );
}

function BulkButton({ children, icon, onClick, disabled, destructive = false }: { children: ReactNode; icon: ReactNode; onClick: () => void; disabled: boolean; destructive?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-medium transition-[background-color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm ${destructive ? "text-destructive hover:bg-red-50" : "hover:bg-muted"}`}>
      {icon}{children}
    </button>
  );
}

function DialogFrame({ dialogRef, title, description, children }: { dialogRef: React.RefObject<HTMLDialogElement | null>; title: string; description: string; children: ReactNode }) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId} className="m-0 mt-auto max-h-[88dvh] w-full rounded-t-3xl border border-border bg-surface p-0 shadow-2xl sm:m-auto sm:w-[min(92vw,620px)] sm:rounded-2xl" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="flex items-start gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1"><h2 id={titleId} className="font-display text-xl font-semibold">{title}</h2><p id={descriptionId} className="mt-1 text-sm text-muted-foreground">{description}</p></div>
        <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Dialog schließen" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-muted"><X size={18} /></button>
      </div>
      <div className="max-h-[calc(88dvh-5rem)] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

function MoveDialog({ dialogRef, folders, selectedVisibilities, count, disabled, onSubmit }: { dialogRef: React.RefObject<HTMLDialogElement | null>; folders: FolderOption[]; selectedVisibilities: Set<string>; count: number; disabled: boolean; onSubmit: (folderId: string) => void }) {
  const [target, setTarget] = useState("");
  const visibility = selectedVisibilities.size === 1 ? [...selectedVisibilities][0] : undefined;
  const options = visibility ? folders.filter((folder) => folder.visibility === visibility) : folders;
  return (
    <DialogFrame dialogRef={dialogRef} title="Dokumente verschieben" description={`${count} ausgewählte Dokumente erhalten einen gemeinsamen Zielordner.`}>
      {selectedVisibilities.size > 1 ? <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">Private und gemeinsame Dokumente müssen getrennt verschoben werden.</p> : null}
      <label htmlFor="bulk-target-folder" className="text-sm font-medium">Zielordner</label>
      <select id="bulk-target-folder" value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3">
        <option value="">Bitte auswählen</option>
        {options.map((folder) => <option key={folder.id} value={folder.id}>{folder.visibility === "private" ? "Privat" : "Familie"} · {folder.name}</option>)}
      </select>
      <button type="button" disabled={disabled || !target} onClick={() => onSubmit(target)} className="mt-5 min-h-11 w-full rounded-xl bg-primary px-4 font-medium text-primary-foreground transition-transform active:scale-[0.96] disabled:opacity-45">{count} Dokumente verschieben</button>
    </DialogFrame>
  );
}

function TagsDialog({ dialogRef, tags, count, disabled, onSubmit }: { dialogRef: React.RefObject<HTMLDialogElement | null>; tags: TagOption[]; count: number; disabled: boolean; onSubmit: (action: "add-tags" | "remove-tags", ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return (
    <DialogFrame dialogRef={dialogRef} title="Tags mehrfach bearbeiten" description={`Tags für ${count} Dokumente ergänzen oder gezielt entfernen.`}>
      <fieldset><legend className="sr-only">Tags auswählen</legend><div className="grid gap-2 sm:grid-cols-2">
        {tags.map((tag) => <label key={tag.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 hover:bg-muted"><input type="checkbox" checked={selected.includes(tag.id)} onChange={() => toggle(tag.id)} /><span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} /><span className="truncate text-sm">{tag.name}</span></label>)}
      </div></fieldset>
      {tags.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Noch keine Tags verfügbar.</p> : null}
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={disabled || selected.length === 0} onClick={() => onSubmit("remove-tags", selected)} className="min-h-11 rounded-xl bg-muted px-4 text-sm font-medium disabled:opacity-45">Ausgewählte entfernen</button>
        <button type="button" disabled={disabled || selected.length === 0} onClick={() => onSubmit("add-tags", selected)} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-45">Ausgewählte hinzufügen</button>
      </div>
    </DialogFrame>
  );
}

function ConfirmTrashDialog({ dialogRef, count, disabled, onConfirm }: { dialogRef: React.RefObject<HTMLDialogElement | null>; count: number; disabled: boolean; onConfirm: () => void }) {
  return (
    <DialogFrame dialogRef={dialogRef} title="In den Papierkorb verschieben" description="Die Dokumente bleiben 30 Tage wiederherstellbar.">
      <p className="text-sm leading-6">Möchtest du <strong className="tabular-nums">{count} Dokumente</strong> in den Papierkorb verschieben?</p>
      <button type="button" disabled={disabled} onClick={onConfirm} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-destructive px-4 font-medium text-white transition-transform active:scale-[0.96] disabled:opacity-45"><Trash2 size={18} /> In den Papierkorb</button>
    </DialogFrame>
  );
}
