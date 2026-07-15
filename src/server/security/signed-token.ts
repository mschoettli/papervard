import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

type TokenPayload = {
  purpose: string;
  exp?: number;
  [key: string]: unknown;
};

function signingSecret() {
  const secret = process.env.PAPERVARD_SIGNING_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("PAPERVARD_SIGNING_SECRET muss mindestens 24 Zeichen lang sein.");
  }
  return secret;
}

function signature(encodedPayload: string) {
  return createHmac("sha256", signingSecret()).update(encodedPayload).digest("base64url");
}

export function signToken(payload: TokenPayload, lifetimeSeconds: number) {
  const encodedPayload = Buffer.from(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + lifetimeSeconds
  })).toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload)}`;
}

export function verifyToken(token: string, expectedPurpose: string): TokenPayload {
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) throw new Error("Ungültige Token-Signatur.");

  const expected = Buffer.from(signature(encodedPayload));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("Ungültige Token-Signatur.");
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    throw new Error("Ungültiger Token-Inhalt.");
  }
  if (payload.purpose !== expectedPurpose) throw new Error("Token ist für diesen Zweck ungültig.");
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token ist abgelaufen.");
  }
  return payload;
}
