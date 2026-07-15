import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  const url = new URL(request.url);
  const ids = url.searchParams.getAll("documentId").filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ message: "Keine Dokumente ausgewählt." }, { status: 400 });
  }

  const householdIds = await householdIdsForUser(admin.id);
  const documents = await prisma.document.findMany({
    where: { AND: [{ id: { in: ids } }, documentAccessWhere(admin.id, householdIds, true)] },
    orderBy: [{ year: "desc" }, { title: "asc" }]
  });

  const entries = await Promise.all(
    documents.map(async (document) => ({
      name: safeFileName(`${document.year}-${document.title || document.id}.pdf`),
      data: await readFile(document.storagePath)
    }))
  );

  const archive = makeTar(entries);
  return new NextResponse(archive, {
    headers: {
      "Content-Type": "application/x-tar",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="papervard-documents-${Date.now()}.tar"`
    }
  });
}

function safeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(0, 96);
}

function makeTar(entries: Array<{ name: string; data: Buffer }>) {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    writeString(header, entry.name, 0, 100);
    writeString(header, "0000644", 100, 8);
    writeString(header, "0000000", 108, 8);
    writeString(header, "0000000", 116, 8);
    writeString(header, entry.data.length.toString(8).padStart(11, "0"), 124, 12);
    writeString(header, Math.floor(Date.now() / 1000).toString(8).padStart(11, "0"), 136, 12);
    header.fill(" ", 148, 156);
    header[156] = "0".charCodeAt(0);
    writeString(header, "ustar", 257, 6);
    writeString(header, "00", 263, 2);

    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeString(header, checksum.toString(8).padStart(6, "0"), 148, 6);
    header[154] = 0;
    header[155] = 32;

    blocks.push(header, entry.data, Buffer.alloc((512 - (entry.data.length % 512)) % 512, 0));
  }

  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
}

function writeString(buffer: Buffer, value: string, offset: number, length: number) {
  buffer.write(value.slice(0, length), offset, length, "utf8");
}
