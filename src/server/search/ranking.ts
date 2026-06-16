export type RankedHit = {
  chunkId: string;
  documentId: string;
  title: string;
  year: number;
  page: number;
  excerpt: string;
  keywordRank: number;
  semanticRank: number;
};

export function combineRank(keywordRank: number, semanticRank: number) {
  const keyword = Math.max(0, Math.min(1, keywordRank));
  const semantic = Math.max(0, Math.min(1, semanticRank));
  return Number((keyword * 0.62 + semantic * 0.38).toFixed(4));
}

export function makeExcerpt(content: string, query: string, maxLength = 260) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const firstTerm = query.split(/\s+/).find(Boolean)?.toLowerCase();
  const index = firstTerm ? normalized.toLowerCase().indexOf(firstTerm) : -1;
  const start = Math.max(0, index === -1 ? 0 : index - 90);
  const excerpt = normalized.slice(start, start + maxLength);
  return `${start > 0 ? "... " : ""}${excerpt}${start + maxLength < normalized.length ? " ..." : ""}`;
}
