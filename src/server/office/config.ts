import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import type { DocumentFamily } from "@prisma/client";
import { signToken } from "@/server/security/signed-token";

const EDITABLE_EXTENSIONS = new Set([
  "doc", "docx", "odt", "rtf", "txt", "html", "pdf",
  "xls", "xlsx", "xlsm", "ods", "csv", "tsv",
  "ppt", "pptx", "odp"
]);

type OfficeDocument = {
  id: string;
  originalName: string;
  family: DocumentFamily;
  currentVersion: { id: string; versionNumber: number } | null;
};

type OfficeUser = { id: string; name: string };

type EditableDocument = Pick<OfficeDocument, "originalName" | "family">;

function jwtSecret() {
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!secret || secret.length < 24) throw new Error("ONLYOFFICE_JWT_SECRET muss mindestens 24 Zeichen lang sein.");
  return secret;
}

function signJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", jwtSecret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyOnlyOfficeJwt(token: string) {
  const [header, body, suppliedSignature, extra] = token.split(".");
  if (!header || !body || !suppliedSignature || extra) throw new Error("Ungültiges ONLYOFFICE-Token.");
  const expected = Buffer.from(createHmac("sha256", jwtSecret()).update(`${header}.${body}`).digest("base64url"));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("Ungültiges ONLYOFFICE-Token.");
  }
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    document: { key: string };
    [key: string]: unknown;
  };
}

function documentType(family: DocumentFamily, fileType: string) {
  if (fileType === "pdf") return "pdf";
  if (family === "document") return "word";
  if (family === "spreadsheet") return "cell";
  if (family === "presentation") return "slide";
  return null;
}

export function isOnlyOfficeEditable(document: EditableDocument) {
  const fileType = path.extname(document.originalName).slice(1).toLowerCase();
  return Boolean(documentType(document.family, fileType) && EDITABLE_EXTENSIONS.has(fileType));
}

export function createOnlyOfficeConfig(document: OfficeDocument, user: OfficeUser) {
  const fileType = path.extname(document.originalName).slice(1).toLowerCase();
  const type = documentType(document.family, fileType);
  if (!isOnlyOfficeEditable(document) || !type || !document.currentVersion) {
    throw new Error("Dieses Format kann nicht direkt in ONLYOFFICE bearbeitet werden.");
  }

  const internalUrl = (process.env.PAPERVARD_INTERNAL_URL ?? "http://web:3000").replace(/\/$/, "");
  const fileToken = signToken({
    purpose: "office-file",
    documentId: document.id,
    versionId: document.currentVersion.id
  }, 60 * 60);
  const callbackToken = signToken({
    purpose: "office-callback",
    documentId: document.id,
    userId: user.id
  }, 24 * 60 * 60);

  const unsignedConfig = {
    documentType: type,
    document: {
      fileType,
      key: `${document.id}-${document.currentVersion.id}`,
      title: document.originalName,
      url: `${internalUrl}/api/office/files/${fileToken}`,
      permissions: {
        edit: true,
        download: true,
        print: true,
        review: true,
        comment: true
      }
    },
    editorConfig: {
      mode: "edit",
      callbackUrl: `${internalUrl}/api/office/callback/${document.id}?access=${encodeURIComponent(callbackToken)}`,
      user: { id: user.id, name: user.name },
      customization: {
        autosave: true,
        forcesave: true,
        compactHeader: false
      }
    }
  };

  return { ...unsignedConfig, token: signJwt(unsignedConfig) };
}
