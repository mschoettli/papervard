"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

export function DocumentThumbnail({ documentId, title }: { documentId: string; title: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex aspect-[5/6] w-full items-center justify-center overflow-hidden rounded-lg bg-muted/40 outline outline-1 -outline-offset-1 outline-black/10">
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <FileText size={36} />
          <span className="text-xs font-medium uppercase">PDF</span>
        </div>
      ) : (
        <img
          src={`/api/documents/${documentId}/thumbnail`}
          alt={`Erste Seite von ${title}`}
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
