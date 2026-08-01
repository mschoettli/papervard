import { randomUUID } from "node:crypto";
import { processNextJob } from "@/server/jobs/processor";
import { reconcileSmbLibrary } from "@/server/smb/sync";
import { purgeExpiredDocumentExports } from "@/server/documents/exports";

const workerId = process.env.WORKER_ID ?? `papervard-${randomUUID()}`;
const idleDelayMs = Number(process.env.WORKER_IDLE_DELAY_MS ?? 1000);
let stopping = false;
let nextSmbSyncAt = 0;
let nextExportCleanupAt = 0;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function main() {
  while (!stopping) {
    if (Date.now() >= nextExportCleanupAt) {
      try {
        await purgeExpiredDocumentExports();
      } catch (error) {
        console.error("Export-Bereinigung fehlgeschlagen:", error);
      }
      nextExportCleanupAt = Date.now() + 60_000;
    }
    if (process.env.SMB_SYNC_ENABLED !== "false" && Date.now() >= nextSmbSyncAt) {
      try {
        await reconcileSmbLibrary();
      } catch (error) {
        console.error("SMB-Abgleich fehlgeschlagen:", error);
      }
      nextSmbSyncAt = Date.now() + Number(process.env.SMB_SYNC_INTERVAL_MS ?? 5000);
    }
    const processed = await processNextJob(workerId);
    if (!processed) await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
  }
}

main().catch((error) => {
  console.error("Papervard-Worker wurde beendet:", error);
  process.exitCode = 1;
});
