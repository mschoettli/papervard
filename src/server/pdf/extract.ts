import "server-only";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pdfParse from "pdf-parse";
import type { PageText } from "@/server/pdf/chunk";

const execFileAsync = promisify(execFile);

export async function extractPdfText(filePath: string) {
  const buffer = await readFile(filePath);
  const parsed = await pdfParse(buffer);
  const text = parsed.text.trim();
  const pageCount = parsed.numpages || 1;

  if (text.length > 50) {
    return {
      pageCount,
      pages: splitParsedText(text, pageCount)
    };
  }

  const ocrPages = await runLocalOcr(filePath, pageCount);
  return { pageCount, pages: ocrPages };
}

function splitParsedText(text: string, pageCount: number): PageText[] {
  const pages = text.split(/\f/g).filter((page) => page.trim().length > 0);
  if (pages.length > 1) {
    return pages.map((page, index) => ({ page: index + 1, text: page }));
  }

  return [{ page: 1, text: text.slice(0, Math.max(text.length, 1)) || "" }].concat(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => ({
      page: index + 2,
      text: ""
    }))
  );
}

async function runLocalOcr(filePath: string, pageCount: number): Promise<PageText[]> {
  const workDir = await mkdtemp(path.join(tmpdir(), "papervard-ocr-"));
  const prefix = path.join(workDir, "page");
  const languages = process.env.OCR_LANGUAGES ?? "deu+eng+fra+ita+spa";

  try {
    await execFileAsync("pdftoppm", ["-r", "180", "-png", filePath, prefix], { timeout: 120000 });
    const pages: PageText[] = [];

    for (let page = 1; page <= pageCount; page += 1) {
      const image = `${prefix}-${String(page).padStart(1, "0")}.png`;
      const output = path.join(workDir, `ocr-${page}`);
      try {
        await execFileAsync("tesseract", [image, output, "-l", languages], { timeout: 120000 });
        pages.push({ page, text: await readFile(`${output}.txt`, "utf8") });
      } catch {
        pages.push({ page, text: "" });
      }
    }

    return pages;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function createSmallPdfFixture(filePath: string, text: string) {
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${text.length + 64}>>stream
BT /F1 18 Tf 72 720 Td (${text.replace(/[()]/g, "")}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000360 00000 n 
trailer<</Root 1 0 R/Size 6>>
startxref
430
%%EOF`;
  await writeFile(filePath, body);
}
