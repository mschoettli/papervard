import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { getUpdateStatus } from "@/server/update";

export async function GET() {
  await requireAdmin();
  const status = await getUpdateStatus();

  return NextResponse.json({
    currentSha: status.currentSha,
    latestSha: status.latestSha,
    updateAvailable: status.updateAvailable,
    canTriggerUpdate: status.canTriggerUpdate,
    statusLabel: status.statusLabel,
    error: status.error,
    verifiedCurrent: Boolean(status.currentSha && status.latestSha && status.currentSha === status.latestSha)
  });
}
