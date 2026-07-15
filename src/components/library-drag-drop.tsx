"use client";

import { useState, useTransition, type DragEvent, type ReactNode } from "react";
import { moveDocumentAction } from "@/server/actions/documents";
import { moveFolderAction } from "@/server/actions/library";
import { cn } from "@/lib/utils";

type LibraryItemType = "document" | "folder";

function readLibraryItem(event: DragEvent) {
  try {
    return JSON.parse(event.dataTransfer.getData("application/x-papervard-item")) as {
      type: LibraryItemType;
      id: string;
    };
  } catch {
    return null;
  }
}

export function DraggableLibraryItem({
  type,
  id,
  label,
  children,
  className
}: {
  type: LibraryItemType;
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      draggable
      aria-label={`${label} verschieben`}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-papervard-item", JSON.stringify({ type, id }));
      }}
      className={cn("cursor-grab active:cursor-grabbing", className)}
    >
      {children}
    </div>
  );
}

export function FolderDropTarget({
  folderId,
  label,
  children,
  className
}: {
  folderId: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setOver(false);
    const item = readLibraryItem(event);
    if (!item) return;
    startTransition(async () => {
      const data = new FormData();
      data.set("targetFolderId", folderId);
      try {
        if (item.type === "document") {
          data.set("documentId", item.id);
          await moveDocumentAction(data);
        } else {
          data.set("folderId", item.id);
          await moveFolderAction(data);
        }
        setMessage(`${label} ist jetzt der Zielordner.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Verschieben nicht möglich.");
      }
    });
  }

  return (
    <div
      onDragEnter={(event) => { event.preventDefault(); setOver(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={handleDrop}
      aria-busy={pending}
      className={cn(
        "rounded-xl transition-[box-shadow,background-color,transform] duration-200",
        over && "bg-primary/10 shadow-[0_0_0_3px_hsl(var(--primary)/0.28)] scale-[1.01]",
        className
      )}
    >
      {children}
      <span className="sr-only" role="status" aria-live="polite">{message}</span>
    </div>
  );
}
