"use client";

export default function DocumentsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-center" role="alert">
      <h1 className="text-lg font-semibold text-red-900">Dokumente konnten nicht geladen werden</h1>
      <p className="mt-2 text-sm text-red-800">Bitte versuche es noch einmal. Deine Dateien wurden dadurch nicht verändert.</p>
      <button onClick={reset} className="mt-4 h-10 rounded-md bg-red-900 px-4 text-sm font-medium text-white hover:bg-red-800">
        Erneut versuchen
      </button>
    </section>
  );
}
