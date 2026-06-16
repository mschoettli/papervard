"use server";

import { redirect } from "next/navigation";
import { login, logout } from "@/server/auth";

export async function loginAction(_: { message?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await login(email, password);

  if (!result.ok) return { message: result.message };
  redirect("/documents");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
