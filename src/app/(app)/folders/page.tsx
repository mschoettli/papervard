import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, FolderOpen, Search, Trash2 } from "lucide-react";
import { FolderBrowser } from "@/components/folder-browser";
import { CreateFolderModal, TagManagerModal, TagSelectionModal } from "@/components/library-modals";
import { prisma } from "@/lib/prisma";
import {
  createFolderAction,
  createTagAction,
  deleteTagAction,
  mergeTagAction,
  moveFolderAction,
  renameFolderAction,
  reorderFolderAction,
  trashFolderAction,
  updateFolderTagsAction,
  updateTagAction
} from "@/server/actions/library";
import { requireUser } from "@/server/auth";
import { householdIdsForUser } from "@/server/documents/access";
import { collectDescendantFolderIds, folderAccessWhere } from "@/server/documents/folders";

type FolderSearchParams = { folder?: string };

export default async function FoldersPage({ searchParams }: { searchParams: Promise<FolderSearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const householdIds = await householdIdsForUser(user.id);
  const isAdmin = user.role === "admin";
  const [folders, tags] = await Promise.all([
    prisma.folder.findMany({
      where: folderAccessWhere(user.id, householdIds, isAdmin),
      include: {
        _count: {
          select: {
            documents: { where: { deletedAt: null } },
            children: { where: { deletedAt: null } }
          }
        },
        tags: { include: { tag: true } }
      },
      orderBy: [{ isSystem: "desc" }, { position: "asc" }, { name: "asc" }]
    }),
    prisma.tag.findMany({
      where: { householdId: { in: householdIds } },
      include: { _count: { select: { documents: true } } },
      orderBy: { name: "asc" }
    })
  ]);
  const currentFolder = params.folder ? folders.find((folder) => folder.id === params.folder) : undefined;
  if (params.folder && !currentFolder) redirect("/folders");
  const currentParentId = currentFolder?.id ?? null;
  const childFolders = folders.filter((folder) => folder.parentId === currentParentId);
  const breadcrumbs = currentFolder ? buildBreadcrumbs(folders, currentFolder.id) : [];
  const directCounts = new Map(folders.map((folder) => [folder.id, folder._count.documents]));
  const browserFolders = childFolders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    icon: folder.icon,
    parentId: folder.parentId,
    visibility: folder.visibility,
    isSystem: folder.isSystem,
    childCount: folder._count.children,
    documentCount: collectDescendantFolderIds(folders, folder.id)
      .reduce((sum, id) => sum + (directCounts.get(id) ?? 0), 0)
  }));

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Papervard Archiv</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Ordner</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground"><span className="tabular-nums">{folders.length}</span> Ordner strukturiert verwalten.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CreateFolderModal
            folders={folders}
            defaultParentId={currentFolder?.id}
            defaultVisibility={currentFolder?.visibility ?? "private"}
            createAction={createFolderAction}
          />
          <Link href="/documents?trash=1" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium hover:bg-muted">
            <Trash2 aria-hidden="true" size={17} /> Papierkorb
          </Link>
        </div>
      </header>

      <form action="/documents" className="flex flex-col gap-2 rounded-2xl bg-surface p-3 shadow-[0_1px_0_rgba(20,40,35,0.06),0_12px_30px_rgba(20,40,35,0.05)] sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Alle Dokumente durchsuchen</span>
          <Search aria-hidden="true" size={19} className="pointer-events-none absolute left-4 top-3 text-muted-foreground" />
          <input name="q" type="search" placeholder="Alle Dokumente durchsuchen …" className="h-11 w-full rounded-xl border border-border bg-surface pl-11 pr-4" />
        </label>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground"><Search size={17} /> Suchen</button>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Ordnerpfad" className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
          <Link href="/folders" aria-current={!currentFolder ? "page" : undefined} className={!currentFolder ? "font-semibold" : "text-muted-foreground hover:text-foreground"}>Alle Ordner</Link>
          {breadcrumbs.map((folder) => (
            <span key={folder.id} className="flex shrink-0 items-center gap-1">
              <ChevronRight aria-hidden="true" size={14} className="text-muted-foreground" />
              <Link href={`/folders?folder=${folder.id}`} aria-current={folder.id === currentFolder?.id ? "page" : undefined} className={folder.id === currentFolder?.id ? "font-semibold" : "text-muted-foreground hover:text-foreground"}>{folder.name}</Link>
            </span>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2">
          <TagManagerModal tags={tags} createAction={createTagAction} updateAction={updateTagAction} mergeAction={mergeTagAction} deleteAction={deleteTagAction} />
          {currentFolder ? (
            <TagSelectionModal subjectId={currentFolder.id} subjectName={currentFolder.name} subjectType="folder" tags={tags} selectedTagIds={currentFolder.tags.map((item) => item.tagId)} updateAction={updateFolderTagsAction} />
          ) : null}
        </div>
      </div>

      <section aria-labelledby="folders-heading">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 id="folders-heading" className="font-display text-2xl font-semibold">{currentFolder?.name ?? "Alle Ordner"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{currentFolder ? "Unterordner dieser Ebene" : "Private und gemeinsame Hauptordner"}</p>
          </div>
          <span className="tabular-nums text-sm text-muted-foreground">{childFolders.length}</span>
        </div>
        {browserFolders.length ? (
          <FolderBrowser
            folders={browserFolders}
            allFolders={folders}
            currentParentId={currentParentId}
            reorderAction={reorderFolderAction}
            renameAction={renameFolderAction}
            moveAction={moveFolderAction}
            trashAction={trashFolderAction}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-surface/70 p-10 text-center">
            <FolderOpen aria-hidden="true" size={34} className="mx-auto text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl font-semibold">Keine Unterordner</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Erstelle einen Unterordner oder öffne die hier abgelegten Dokumente.</p>
            {currentFolder ? <Link href={`/documents?folder=${currentFolder.id}`} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">Dokumente anzeigen</Link> : null}
          </div>
        )}
      </section>
    </div>
  );
}

function buildBreadcrumbs<T extends { id: string; parentId: string | null }>(folders: T[], currentId: string) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const result: T[] = [];
  const seen = new Set<string>();
  let current = byId.get(currentId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    result.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return result;
}
