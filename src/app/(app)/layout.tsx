import type React from "react";
import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen lg:flex">
      <AppNav user={user} />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
