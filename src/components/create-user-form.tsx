"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/button";
import { createUserAction } from "@/server/actions/users";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state?.ok]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid gap-3 rounded-lg border border-border bg-white p-4 lg:grid-cols-[1fr_1fr_150px_130px_auto]"
    >
      <input name="name" required placeholder="Name" className="h-10 rounded-md border border-border px-3 text-sm" />
      <input name="email" required type="email" placeholder="E-Mail" className="h-10 rounded-md border border-border px-3 text-sm" />
      <input name="password" required type="password" minLength={10} placeholder="Passwort" className="h-10 rounded-md border border-border px-3 text-sm" />
      <select name="role" defaultValue="user" className="h-10 rounded-md border border-border bg-white px-3 text-sm">
        <option value="user">Nutzer</option>
        <option value="admin">Admin</option>
      </select>
      <Button disabled={pending}>{pending ? "Erstellen ..." : "Erstellen"}</Button>
      {state?.message ? (
        <p className={state.ok ? "text-sm text-green-700 lg:col-span-5" : "text-sm text-red-700 lg:col-span-5"}>{state.message}</p>
      ) : null}
    </form>
  );
}
