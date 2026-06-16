export type PageText = {
  page: number;
  text: string;
};

export function chunkPages(pages: PageText[], maxChars = 1800) {
  const chunks: PageText[] = [];

  for (const page of pages) {
    const clean = page.text.replace(/\s+/g, " ").trim();
    if (!clean) continue;

    for (let index = 0; index < clean.length; index += maxChars) {
      chunks.push({
        page: page.page,
        text: clean.slice(index, index + maxChars)
      });
    }
  }

  return chunks;
}
