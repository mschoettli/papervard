"use client";

import Link from "next/link";
import { Archive, ArrowDown, ArrowUp, FileText, GripVertical, Lock, Users } from "lucide-react";
import { useState, useTransition, type DragEvent } from "react";
import { FolderGlyph } from "@/components/folder-icon";
import { FolderActionsMenu } from "@/components/library-modals";
import { cn } from "@/lib/utils";

type ServerFormAction = (formData: FormData) => void | Promise<void>;

export type FolderBrowserItem = {
  id: string;
  name: string;
  icon: string;
  parentId: string | null;
  visibility: "private" | "family";
  isSystem: boolean;
  childCount: number;
  documentCount: number;
};

type FolderOption = Pick<FolderBrowserItem, "id" | "name" | "parentId" | "visibility">;

export function FolderBrowser({
  folders,
  allFolders,
  currentParentId,
  reorderAction,
  renameAction,
  moveAction,
  trashAction
}: {
  folders: FolderBrowserItem[];
  allFolders: FolderOption[];
  currentParentId: string | null;
  reorderAction: ServerFormAction;
  renameAction: ServerFormAction;
  moveAction: ServerFormAction;
  trashAction: ServerFormAction;
}) {
  const [draggedId, setDraggedId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<string>();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submitMove(folderId: string, targetParentId: string | null, beforeFolderId?: string) {
    const folder = folders.find((item) => item.id === folderId);
    const data = new FormData();
    data.set("folderId", folderId);
    data.set("targetParentId", targetParentId ?? "");
    data.set("beforeFolderId", beforeFolderId ?? "");
    startTransition(async () => {
      try {
        await reorderAction(data);
        setMessage(`${folder?.name ?? "Ordner"} wurde verschoben.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Ordner konnte nicht verschoben werden.");
      } finally {
        setDraggedId(undefined);
        setDropTarget(undefined);
      }
    });
  }

  function allowDrop(event: DragEvent, target: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(target);
  }

  const movableFolders = folders.filter((folder) => !folder.isSystem);

  return (
    <div aria-busy={pending}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {folders.map((folder, index) => {
          const movableIndex = movableFolders.findIndex((item) => item.id === folder.id);
          const previous = movableFolders[movableIndex - 1];
          const afterNext = movableFolders[movableIndex + 2];
          const openHref = folder.childCount > 0 ? `/folders?folder=${folder.id}` : `/documents?folder=${folder.id}`;
          return (
            <article
              key={folder.id}
              className={cn(
                "relative min-w-0 rounded-2xl border border-border bg-surface p-4 transition-[border-color,box-shadow,transform]",
                draggedId && draggedId !== folder.id && "hover:border-primary/40",
                dropTarget === `inside:${folder.id}` && "border-primary bg-primary/5 shadow-[0_0_0_3px_hsl(var(--primary)/0.16)]",
                pending && "opacity-70"
              )}
              onDragOver={(event) => draggedId && draggedId !== folder.id && allowDrop(event, `inside:${folder.id}`)}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedId && draggedId !== folder.id) submitMove(draggedId, folder.id);
              }}
            >
              {draggedId && draggedId !== folder.id ? (
                <>
                  <div
                    aria-hidden="true"
                    className={cn(
                      "absolute -left-2 top-3 z-10 h-[calc(100%-1.5rem)] w-4 rounded-full",
                      dropTarget === `before:${folder.id}` && "bg-primary/20"
                    )}
                    onDragOver={(event) => {
                      event.stopPropagation();
                      allowDrop(event, `before:${folder.id}`);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      submitMove(draggedId, currentParentId, folder.id);
                    }}
                  />
                  {index === folders.length - 1 ? (
                    <div
                      aria-hidden="true"
                      data-drop-zone="append-after-last"
                      className={cn(
                        "absolute -right-2 top-3 z-10 h-[calc(100%-1.5rem)] w-4 rounded-full",
                        dropTarget === "append" && "bg-primary/20"
                      )}
                      onDragOver={(event) => {
                        event.stopPropagation();
                        allowDrop(event, "append");
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        submitMove(draggedId, currentParentId);
                      }}
                    />
                  ) : null}
                </>
              ) : null}

              <div className="flex items-start gap-3">
                <Link href={openHref} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {folder.isSystem ? <Archive aria-hidden="true" size={23} /> : <FolderGlyph icon={folder.icon} size={24} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{folder.name}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      <span className="tabular-nums">{folder.documentCount}</span> Dokumente
                      {folder.childCount > 0 ? ` · ${folder.childCount} Unterordner` : ""}
                    </span>
                  </span>
                </Link>
                {!folder.isSystem ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      draggable
                      aria-label={`${folder.name} mit Drag-and-drop verschieben`}
                      className="flex h-11 w-11 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", folder.id);
                        setDraggedId(folder.id);
                      }}
                      onDragEnd={() => { setDraggedId(undefined); setDropTarget(undefined); }}
                    >
                      <GripVertical aria-hidden="true" size={18} />
                    </button>
                    <FolderActionsMenu
                      folder={folder}
                      folders={allFolders}
                      renameAction={renameAction}
                      moveAction={moveAction}
                      trashAction={trashAction}
                      orderControls={(
                        <div className="grid grid-cols-2 gap-1 pb-1.5">
                          <form action={reorderAction}>
                            <input type="hidden" name="folderId" value={folder.id} />
                            <input type="hidden" name="targetParentId" value={currentParentId ?? ""} />
                            <input type="hidden" name="beforeFolderId" value={previous?.id ?? folder.id} />
                            <button disabled={!previous} className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg px-2 text-xs hover:bg-muted disabled:opacity-40"><ArrowUp size={14} /> Hoch</button>
                          </form>
                          <form action={reorderAction}>
                            <input type="hidden" name="folderId" value={folder.id} />
                            <input type="hidden" name="targetParentId" value={currentParentId ?? ""} />
                            <input type="hidden" name="beforeFolderId" value={afterNext?.id ?? ""} />
                            <button disabled={movableIndex === movableFolders.length - 1} className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg px-2 text-xs hover:bg-muted disabled:opacity-40"><ArrowDown size={14} /> Runter</button>
                          </form>
                        </div>
                      )}
                    />
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  {folder.visibility === "private" ? <Lock aria-hidden="true" size={14} /> : <Users aria-hidden="true" size={14} />} {folder.visibility === "private" ? "Nur ich" : "Familie"}
                </span>
                <Link href={`/documents?folder=${folder.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-medium text-primary hover:bg-primary/10">
                  <FileText aria-hidden="true" size={15} /> Dokumente anzeigen
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
    </div>
  );
}
