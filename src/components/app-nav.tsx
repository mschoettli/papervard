import Link from "next/link";
import type React from "react";
import { Archive, FileSearch, LogOut, Upload, Users } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";

export function AppNav({ role }: { role: "admin" | "user" }) {
  return (
    <aside className="border-b border-border bg-white lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Link href="/documents" className="text-lg font-semibold tracking-normal">
          Papervard
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto p-3 lg:block">
        <NavItem href="/documents" icon={<Archive size={18} />} label="Dokumente" />
        <NavItem href="/search" icon={<FileSearch size={18} />} label="Suche" />
        {role === "admin" ? (
          <>
            <NavItem href="/admin/uploads" icon={<Upload size={18} />} label="Uploads" />
            <NavItem href="/admin/documents" icon={<Archive size={18} />} label="Verwaltung" />
            <NavItem href="/admin/users" icon={<Users size={18} />} label="Benutzer" />
          </>
        ) : null}
      </nav>
      <form action={logoutAction} className="p-3 lg:mt-auto">
        <button className="flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          <LogOut size={18} />
          Abmelden
        </button>
      </form>
    </aside>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {icon}
      {label}
    </Link>
  );
}
