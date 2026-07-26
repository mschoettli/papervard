import type React from "react";
import { AppNav } from "@/components/app-nav";
import { UploadManagerProvider, UploadStatusDock } from "@/components/upload-manager";
import { requireUser } from "@/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <UploadManagerProvider>
      <div className="min-h-screen lg:flex">
        <a href="#main-content" className="sr-only z-50 rounded-md bg-surface px-4 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Zum Inhalt springen
        </a>
        <AppNav user={user} />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        <UploadStatusDock />
      </div>
    </UploadManagerProvider>
  );
}
