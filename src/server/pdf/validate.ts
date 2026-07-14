export function hasPdfSignature(buffer: Buffer | Uint8Array) {
  if (buffer.byteLength < 5) return false;
  return Buffer.from(buffer.subarray(0, 5)).toString("ascii") === "%PDF-";
}
