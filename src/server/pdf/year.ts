export function detectYear(input: string, fallback = new Date().getFullYear()) {
  const candidates = input.match(/\b(19\d{2}|20\d{2})\b/g)?.map(Number) ?? [];
  const now = new Date().getFullYear() + 1;
  const valid = candidates.find((year) => year >= 1900 && year <= now);
  return valid ?? fallback;
}
