import { createHash } from "node:crypto";

export const embeddingDimensions = 384;

export function embedText(text: string) {
  const vector = new Array<number>(embeddingDimensions).fill(0);
  const terms = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const term of terms) {
    const digest = createHash("sha256").update(term).digest();
    const index = digest.readUInt16BE(0) % embeddingDimensions;
    const sign = digest[2] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function vectorLiteral(vector: number[]) {
  return `[${vector.join(",")}]`;
}
