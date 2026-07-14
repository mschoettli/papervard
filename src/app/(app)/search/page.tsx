import { redirect } from "next/navigation";

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; title?: string; year?: string }>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  const query = params.q || params.title;
  if (query) next.set("q", query);
  if (params.year) next.set("year", params.year);
  redirect(`/documents${next.size ? `?${next.toString()}` : ""}`);
}
