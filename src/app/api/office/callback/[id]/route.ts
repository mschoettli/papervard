import { NextResponse } from "next/server";
import { z } from "zod";
import { saveOnlyOfficeVersion } from "@/server/office/callback";
import { verifyToken } from "@/server/security/signed-token";

export const runtime = "nodejs";

const callbackSchema = z.object({
  status: z.number().int(),
  url: z.string().url().optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = new URL(request.url).searchParams.get("access");
    if (!access) throw new Error("Zugriff fehlt.");
    const payload = verifyToken(access, "office-callback");
    if (payload.documentId !== id || typeof payload.userId !== "string") throw new Error("Zugriff passt nicht.");

    const callback = callbackSchema.parse(await request.json());
    if ((callback.status === 2 || callback.status === 6) && callback.url) {
      await saveOnlyOfficeVersion({ documentId: id, userId: payload.userId, downloadUrl: callback.url });
    }
    return NextResponse.json({ error: 0 });
  } catch (error) {
    return NextResponse.json({
      error: 1,
      message: error instanceof Error ? error.message : "Rückspeicherung fehlgeschlagen."
    }, { status: 403 });
  }
}
