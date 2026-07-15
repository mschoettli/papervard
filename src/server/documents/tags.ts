import "server-only";

export const DEFAULT_TAG_COLOR = "#64748b";

export function normalizeTagName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeTagColor(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : DEFAULT_TAG_COLOR;
}
