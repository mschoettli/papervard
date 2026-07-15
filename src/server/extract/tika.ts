import "server-only";

import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

const DEFAULT_TIKA_URL = "http://tika:9998";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_OCR_LANGUAGES = "deu+eng+fra+ita+spa";

export class ProtectedDocumentError extends Error {
  constructor(message = "Die Datei ist geschützt und benötigt ein Passwort.") {
    super(message);
    this.name = "ProtectedDocumentError";
  }
}

function looksProtected(status: number, message: string) {
  return (
    status === 422 ||
    status === 423 ||
    /password|encrypted|encryption|protected|passwort|verschlüsselt/i.test(message)
  );
}

export async function extractWithTika(filePath: string, originalName: string) {
  const baseUrl = (process.env.TIKA_URL ?? DEFAULT_TIKA_URL).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.TIKA_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  );

  try {
    const fileStream = Readable.toWeb(createReadStream(filePath));
    const response = await fetch(`${baseUrl}/tika`, {
      method: "PUT",
      headers: {
        Accept: "text/plain",
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`,
        "X-Tika-OCRLanguage": process.env.OCR_LANGUAGES ?? DEFAULT_OCR_LANGUAGES
      },
      body: fileStream as BodyInit,
      signal: controller.signal,
      // Node requires duplex for streaming request bodies. It is not part of the browser RequestInit type.
      duplex: "half"
    } as RequestInit & { duplex: "half" });

    const text = await response.text();
    if (!response.ok) {
      if (looksProtected(response.status, text)) throw new ProtectedDocumentError();
      throw new Error(`Lokale Texterkennung fehlgeschlagen (${response.status}): ${text.slice(0, 500)}`);
    }

    return {
      text: text.trim(),
      metadata: {
        parser: response.headers.get("x-tika-parsed-by"),
        contentType: response.headers.get("x-tika-content")
      }
    };
  } catch (error) {
    if (error instanceof ProtectedDocumentError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Lokale Texterkennung hat das Zeitlimit überschritten.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
