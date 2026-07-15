import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const encoded = process.env.DICOM_FIELD_KEY;
  if (!encoded) throw new Error("DICOM_FIELD_KEY ist nicht konfiguriert.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("DICOM_FIELD_KEY muss ein Base64-kodierter 256-Bit-Schlüssel sein.");
  return key;
}

export function encryptSensitiveField(value: string | null | undefined, context: string) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSensitiveField(value: string | null | undefined, context: string) {
  if (!value) return null;
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || encodedCiphertext === undefined || extra) {
    throw new Error("Verschlüsseltes Feld besitzt ein unbekanntes Format.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encodedIv, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new Error("Verschlüsseltes Feld konnte nicht authentifiziert werden.");
  }
}
