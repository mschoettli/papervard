import Link from "next/link";
import { Layers3, Lock, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";
import { householdIdsForUser } from "@/server/documents/access";

export default async function CollectionsPage() {
  const user = await requireUser();
  const householdIds = await householdIdsForUser(user.id);
  const collections = await prisma.collection.findMany({
    where: {
      householdId: { in: householdIds },
      ...(user.role === "admin" ? {} : { OR: [{ createdByUserId: user.id }, { visibility: "family" }] })
    },
    include: {
      creator: { select: { name: true } },
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      _count: { select: { items: true } }
    },
    orderBy: { createdAt: "desc" }
  });
  return (
    <div className="mx-auto max-w-screen-xl space-y-5">
      <header>
        <h1 className="text-3xl font-semibold">Sammlungen</h1>
        <p className="mt-2 text-sm text-muted-foreground">Intelligent gruppierte Archiv- und Ordnerimporte, ohne eine tiefe Ablagestruktur zu erzeugen.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {collections.map((collection) => (
          <Link key={collection.id} href={`/collections/${collection.id}`} className="rounded-xl border border-border bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-amber-50 p-3 text-amber-800"><Layers3 aria-hidden="true" size={24} /></span>
              <div className="min-w-0"><h2 className="truncate font-semibold">{collection.name}</h2><p className="text-sm text-muted-foreground">{collection._count.items} Dateien · {collection.creator.name}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">{collection.visibility === "private" ? <Lock size={12} /> : <Users size={12} />}{collection.visibility === "private" ? "Privat" : "Familie"}</span>
              {collection.tags.map(({ tag }) => <span key={tag.id} className="rounded-full px-2 py-1 text-xs text-white" style={{ backgroundColor: tag.color }}>{tag.name}</span>)}
            </div>
          </Link>
        ))}
      </div>
      {collections.length === 0 ? <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Noch keine Sammlung. Lade ein Archiv hoch, um automatisch eine flache Sammlung anzulegen.</p> : null}
    </div>
  );
}
