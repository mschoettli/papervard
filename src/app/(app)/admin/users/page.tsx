import { Button } from "@/components/button";
import { createUserAction, toggleUserAction } from "@/server/actions/users";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal">Benutzer</h1>
        <p className="mt-1 text-sm text-muted-foreground">Konten erstellen, Rollen setzen und Zugänge deaktivieren.</p>
      </header>
      <form action={createUserAction} className="grid gap-3 rounded-lg border border-border bg-white p-4 lg:grid-cols-[1fr_1fr_150px_130px_auto]">
        <input name="name" required placeholder="Name" className="h-10 rounded-md border border-border px-3 text-sm" />
        <input name="email" required type="email" placeholder="E-Mail" className="h-10 rounded-md border border-border px-3 text-sm" />
        <input name="password" required type="password" placeholder="Passwort" className="h-10 rounded-md border border-border px-3 text-sm" />
        <select name="role" defaultValue="user" className="h-10 rounded-md border border-border bg-white px-3 text-sm">
          <option value="user">Nutzer</option>
          <option value="admin">Admin</option>
        </select>
        <Button>Erstellen</Button>
      </form>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">E-Mail</th>
              <th className="px-4 py-3">Rolle</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3">{user.active ? "Aktiv" : "Deaktiviert"}</td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleUserAction}>
                    <input type="hidden" name="id" value={user.id} />
                    <button className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                      {user.active ? "Deaktivieren" : "Aktivieren"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
