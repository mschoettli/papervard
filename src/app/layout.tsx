import type { Metadata } from "next";
import type React from "react";
import { ClientReloadGuard } from "@/components/client-reload-guard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Papervard",
  description: "Authenticated PDF library with local hybrid search",
  icons: {
    icon: "/papervard-icon.png",
    apple: "/papervard-icon.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <ClientReloadGuard />
        {children}
      </body>
    </html>
  );
}
