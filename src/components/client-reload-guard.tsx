"use client";

import { useEffect } from "react";

const reloadStorageKey = "papervard:update-reload-recovered";

function messageFromError(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "";
}

function isRecoverableUpdateError(error: unknown) {
  const message = messageFromError(error).toLowerCase();
  return (
    message.includes("chunkloaderror") ||
    message.includes("loading chunk") ||
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("module script load")
  );
}

function reloadOnce() {
  const lastReload = Number(window.sessionStorage.getItem(reloadStorageKey) ?? "0");
  if (Date.now() - lastReload < 60_000) return;

  window.sessionStorage.setItem(reloadStorageKey, Date.now().toString());
  const url = new URL(window.location.href);
  url.searchParams.set("updated", Date.now().toString());
  window.location.replace(url.toString());
}

export function ClientReloadGuard() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (isRecoverableUpdateError(event.error ?? event.message)) {
        reloadOnce();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isRecoverableUpdateError(event.reason)) {
        reloadOnce();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
