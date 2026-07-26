import type { Metadata } from "next";
import type React from "react";
import { ClientReloadGuard } from "@/components/client-reload-guard";
import "./globals.css";

const themeScript = `
(() => {
  try {
    const saved = localStorage.getItem("papervard-theme");
    const theme = saved === "dark" || saved === "light" ? saved : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();
`;

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
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ClientReloadGuard />
        {children}
      </body>
    </html>
  );
}
