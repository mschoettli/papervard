export default function DocumentsLoading() {
  return (
    <div className="mx-auto max-w-screen-2xl space-y-6" aria-busy="true" aria-label="Dokumente werden geladen">
      <div className="h-16 max-w-md animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="flex gap-2"><div className="h-9 w-24 animate-pulse rounded-full bg-muted" /><div className="h-9 w-36 animate-pulse rounded-full bg-muted" /><div className="h-9 w-28 animate-pulse rounded-full bg-muted" /></div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
        {Array.from({ length: 12 }, (_, index) => <div key={index} className="h-[390px] animate-pulse rounded-2xl bg-muted/70" />)}
      </div>
      <span className="sr-only">Dokumente werden geladen …</span>
    </div>
  );
}
