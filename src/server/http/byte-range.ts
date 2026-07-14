export function parseByteRange(header: string, size: number) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return null;

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)) return null;
  if (start < 0 || start >= size || requestedEnd < start) return null;

  return { start, end: Math.min(requestedEnd, size - 1) };
}
