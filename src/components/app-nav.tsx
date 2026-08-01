"use client";

import Link from "next/link";
import Image from "next/image";
import type React from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Archive, Folder, Home, Layers3, LogOut, Settings, Upload, Users } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";
import { cn } from "@/lib/utils";

type AppUser = {
  name: string;
  email: string;
  role: "admin" | "user";
};

const updateCheckIntervalMs = 60_000;

export function AppNav({ user, updateAvailable = false }: { user: AppUser; updateAvailable?: boolean }) {
  const [showUpdateBadge, setShowUpdateBadge] = useState(updateAvailable);

  useEffect(() => {
    if (user.role !== "admin") return;

    const controller = new AbortController();

    function refreshUpdateStatus() {
      fetch("/api/update/status", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal
      })
        .then((response) => response.ok ? response.json() : null)
        .then((status: { updateAvailable?: boolean } | null) => {
          if (status) setShowUpdateBadge(Boolean(status.updateAvailable));
        })
        .catch(() => undefined);
    }

    refreshUpdateStatus();
    window.addEventListener("focus", refreshUpdateStatus);
    const refreshTimer = window.setInterval(refreshUpdateStatus, updateCheckIntervalMs);

    return () => {
      controller.abort();
      window.removeEventListener("focus", refreshUpdateStatus);
      window.clearInterval(refreshTimer);
    };
  }, [user.role]);

  return (
    <aside className="border-b border-border bg-surface/95 lg:flex lg:min-h-screen lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Link href="/documents" className="flex items-center gap-3 text-lg font-semibold tracking-normal">
          <Image
            src="/papervard-icon.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-lg shadow-sm"
            aria-hidden="true"
            priority
          />
          Papervard
        </Link>
      </div>
      <nav aria-label="Hauptnavigation" className="flex gap-1 overflow-x-auto p-3 lg:block lg:space-y-6">
        <div className="flex gap-1 lg:block lg:space-y-1">
          <NavItem href="/" icon={<Home size={18} />} label="Dashboard" />
          <NavItem href="/folders" icon={<Folder size={18} />} label="Ordner" />
          <NavItem href="/documents" icon={<Archive size={18} />} label="Dokumente" />
          <NavItem href="/collections" icon={<Layers3 size={18} />} label="Sammlungen" />
        </div>
        {user.role === "admin" ? (
          <div className="flex gap-1 lg:block lg:space-y-1">
            <p className="hidden px-3 text-xs font-semibold uppercase text-muted-foreground lg:block">Admin</p>
            <NavItem href="/admin/uploads" icon={<Upload size={18} />} label="Uploads" />
            <NavItem href="/admin/documents" icon={<Archive size={18} />} label="Verwaltung" />
            <NavItem href="/admin/users" icon={<Users size={18} />} label="Benutzer" />
            <NavItem
              href="/admin/system"
              icon={<Settings size={18} />}
              label="System"
              badge={showUpdateBadge ? <UpdateBadge /> : null}
            />
          </div>
        ) : null}
      </nav>
      <div className="hidden border-t border-border p-3 lg:mt-auto lg:block">
        <div className="mb-3 rounded-md bg-muted p-3">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-2 text-xs font-medium uppercase text-primary">{user.role === "admin" ? "Admin" : "Nutzer"}</p>
        </div>
      </div>
      <form action={logoutAction} className="p-3 lg:pt-0">
        <button className="flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          <LogOut size={18} />
          Abmelden
        </button>
      </form>
    </aside>
  );
}

function NavItem({ href, icon, label, badge }: { href: string; icon: React.ReactNode; label: string; badge?: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        active && "bg-primary/10 font-medium text-primary"
      )}
    >
      {icon}
      {label}
      {badge}
    </Link>
  );
}

function UpdateBadge() {
  return (
    <span
      aria-label="Update verfügbar"
      title="Update verfügbar"
      className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm"
    >
      Update
    </span>
  );
}
