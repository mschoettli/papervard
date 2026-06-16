import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "Wartet",
    processing: "Indexiert",
    indexed: "Bereit",
    failed: "Fehler"
  };
  return labels[status] ?? status;
}
