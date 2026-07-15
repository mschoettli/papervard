import Link from "next/link";
import { ArrowLeft, FileText, Tags } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateCollectionTagsAction } from "@/server/actions/library";
import { requireUser } from "@/server/auth";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const householdIds = await householdIdsForUser(user.id);
  const collection = await prisma.collection.findFirst({
    where: {
      id,
      householdId: { in: householdIds },
      ...(user.role === "admin" ? {} : { OR: [{ createdByUserId: user.id }, { visibility: "family" }] })
    },
    include: {
      tags: { include: { tag: true } },
      items: {
        where: { document: documentAccessWhere(user.id, householdIds, user.role === "admin") },
        include: { document: { include: { tags: { include: { tag: true } } } } },
        orderBy: { position: "asc" }
      }
    }
  });
  if (!collection) notFound();
  const tags = await prisma.tag.findMany({ where: { householdId: collection.householdId }, orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-screen-xl space-y-5">
      <Link href="/collections" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={17} /> Sammlungen</Link>
      <header><h1 className="text-3xl font-semibold">{collection.name}</h1><p className="mt-1 text-sm text-muted-foreground">{collection.items.length} zugängliche Dateien</p></header>
      <form action={updateCollectionTagsAction} className="rounded-xl border border-border bg-white p-4">
        <input type="hidden" name="collectionId" value={collection.id} />
        <fieldset><legend className="flex items-center gap-2 font-semibold"><Tags size={17} /> Tags der Sammlung</legend><div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => <label key={tag.id} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3 text-sm"><input type="checkbox" name="tagId" value={tag.id} defaultChecked={collection.tags.some((item) => item.tagId === tag.id)} /><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />{tag.name}</label>)}
        </div></fieldset><button className="mt-3 min-h-11 rounded-md bg-muted px-4 text-sm font-medium">Tags speichern</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {collection.items.map((item) => <Link key={item.documentId} href={`/documents/${item.documentId}`} className="rounded-xl border border-border bg-white p-4 hover:bg-muted/30"><div className="flex gap-3"><FileText className="text-muted-foreground" /><div className="min-w-0"><h2 className="truncate font-medium">{item.document.title}</h2><p className="truncate text-xs text-muted-foreground">{item.relativePath ?? item.document.originalName}</p></div></div><div className="mt-3 flex flex-wrap gap-1">{item.document.tags.map(({ tag }) => <span key={tag.id} className="rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: tag.color }}>{tag.name}</span>)}</div></Link>)}
      </div>
    </div>
  );
}
