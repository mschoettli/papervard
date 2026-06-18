import { CreateUserForm } from "@/components/create-user-form";
import { toggleUserAction } from "@/server/actions/users";
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
      <CreateUserForm />
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
