"use client";

import Image from "next/image";
import type React from "react";
import { useActionState } from "react";
import { Archive, FileSearch, ShieldCheck } from "lucide-react";
import { Button } from "@/components/button";
import { loginAction } from "@/server/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1fr_440px]">
      <section className="hidden min-h-screen flex-col justify-between border-r border-border bg-white p-10 lg:flex">
        <div className="flex items-center gap-3">
          <Image src="/papervard-icon.png" alt="" width={48} height={48} className="size-12 rounded-lg shadow-sm" aria-hidden="true" priority />
          <div>
            <h1 className="text-2xl font-semibold">Papervard</h1>
            <p className="text-sm text-muted-foreground">Lokales PDF-Archiv mit Deep Search</p>
          </div>
        </div>
        <div className="grid gap-4">
          <Feature icon={<Archive size={20} />} title="PDFs zentral verwalten" text="Jahre, Größen und Indexstatus bleiben sofort sichtbar." />
          <Feature icon={<FileSearch size={20} />} title="Schneller wiederfinden" text="Volltext, OCR und lokale semantische Suche arbeiten zusammen." />
          <Feature icon={<ShieldCheck size={20} />} title="Lokal und kontrolliert" text="Nutzer, Rollen und Updates bleiben in deiner Umgebung." />
        </div>
        <p className="text-sm text-muted-foreground">Keine Cloud-Pflicht. Keine externe KI für die Suche.</p>
      </section>

      <section className="flex min-h-screen items-center justify-center p-6">
        <form action={action} className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Image
              src="/papervard-icon.png"
              alt=""
              width={44}
              height={44}
              className="size-11 rounded-lg shadow-sm"
              aria-hidden="true"
              priority
            />
            <div>
              <h1 className="text-xl font-semibold">Papervard</h1>
              <p className="text-sm text-muted-foreground">PDF-Bibliothek anmelden</p>
            </div>
          </div>
          <div className="mb-6 hidden lg:block">
            <h2 className="text-2xl font-semibold">Anmelden</h2>
            <p className="mt-1 text-sm text-muted-foreground">Weiter zu Dashboard, Dokumenten und Suche.</p>
          </div>
          <label className="mb-4 block text-sm font-medium">
            E-Mail
            <input
              name="email"
              type="email"
              required
              className="mt-1 h-10 w-full rounded-md border border-border px-3 outline-none focus:border-primary"
            />
          </label>
          <label className="mb-4 block text-sm font-medium">
            Passwort
            <input
              name="password"
              type="password"
              required
              className="mt-1 h-10 w-full rounded-md border border-border px-3 outline-none focus:border-primary"
            />
          </label>
          {state?.message ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{state.message}</p> : null}
          <Button disabled={pending} className="w-full">
            {pending ? "Anmelden ..." : "Anmelden"}
          </Button>
        </form>
      </section>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}
