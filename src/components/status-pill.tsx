import { cn, statusLabel } from "@/lib/utils";

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium",
        status === "indexed" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        status === "processing" && "border-blue-200 bg-blue-50 text-blue-700",
        status === "queued" && "border-amber-200 bg-amber-50 text-amber-700",
        status === "failed" && "border-red-200 bg-red-50 text-red-700"
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
