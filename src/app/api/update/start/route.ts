import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { triggerContainerUpdate } from "@/server/update";

export async function POST() {
  await requireAdmin();
  const result = await triggerContainerUpdate();

  return NextResponse.json(result, {
    status: result.ok ? 202 : 500
  });
}
