import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { currentRuntime, getUpdateStatus } from "@/server/update";

export async function GET() {
  await requireAdmin();
  const status = await getUpdateStatus();
  const runtime = currentRuntime();

  return NextResponse.json({
    bootId: runtime.bootId,
    startedAt: runtime.startedAt,
    currentSha: status.currentSha,
    latestSha: status.latestSha,
    updateAvailable: status.updateAvailable,
    canTriggerUpdate: status.canTriggerUpdate,
    managedExternally: status.managedExternally,
    statusLabel: status.statusLabel,
    error: status.error,
    verifiedCurrent: Boolean(status.currentSha && status.latestSha && status.currentSha === status.latestSha)
  });
}
