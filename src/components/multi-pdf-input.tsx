"use client";

import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { FileUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function MultiPdfInput({ id: providedId }: { id?: string }) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [error, setError] = useState("");

  function updateNames(files: FileList | File[]) {
    const next = Array.from(files);
    const pdfs = next.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    setFileNames(pdfs.map((file) => file.name));
    setError(pdfs.length === next.length ? "" : "Es werden nur PDF-Dateien übernommen.");
    return pdfs;
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) updateNames(event.target.files);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const pdfs = updateNames(event.dataTransfer.files);
    if (!inputRef.current || pdfs.length === 0) return;

    const transfer = new DataTransfer();
    for (const file of pdfs) transfer.items.add(file);
    inputRef.current.files = transfer.files;
  }

  return (
    <div>
      <label
        htmlFor={id}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-primary/40 bg-muted/60 px-4 py-5 text-center transition hover:bg-muted focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
          dragging && "border-primary bg-primary/10"
        )}
      >
        <FileUp aria-hidden="true" size={28} className="text-primary" />
        <span className="mt-3 font-medium">PDFs hier ablegen oder auswählen</span>
        <span className="mt-1 text-sm text-muted-foreground">Mehrere PDFs sind möglich.</span>
        <input
          ref={inputRef}
          id={id}
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          required
          onChange={handleChange}
          className="sr-only"
        />
        {fileNames.length > 0 ? (
          <span className="mt-3 text-sm font-medium" aria-live="polite">
            {fileNames.length} {fileNames.length === 1 ? "PDF ausgewählt" : "PDFs ausgewählt"}: {fileNames.slice(0, 3).join(", ")}{fileNames.length > 3 ? ` und ${fileNames.length - 3} weitere` : ""}
          </span>
        ) : null}
      </label>
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
