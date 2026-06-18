"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { triggerContainerUpdate } from "@/server/update";

export type UpdateActionState = {
  ok?: boolean;
  message?: string;
};

export async function triggerUpdateAction(_state?: UpdateActionState): Promise<UpdateActionState> {
  await requireAdmin();
  const result = await triggerContainerUpdate();
  revalidatePath("/admin/system");
  return result;
}
