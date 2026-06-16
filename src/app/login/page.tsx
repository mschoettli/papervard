"use client";

import { useActionState } from "react";
import { FileLock } from "lucide-react";
import { Button } from "@/components/button";
import { loginAction } from "@/server/actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <form action={action} className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileLock size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Papervard</h1>
            <p className="text-sm text-muted-foreground">PDF-Bibliothek anmelden</p>
          </div>
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
    </main>
  );
}
