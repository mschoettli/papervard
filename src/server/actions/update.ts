"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { triggerContainerUpdate } from "@/server/update";

export async function triggerUpdateAction() {
  await requireAdmin();
  await triggerContainerUpdate();
  revalidatePath("/admin/system");
}
