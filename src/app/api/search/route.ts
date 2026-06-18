import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { hybridSearch, type SearchMode } from "@/server/search/search";

export async function GET(request: Request) {
  await requireUser();
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const yearValue = url.searchParams.get("year");
  const year = yearValue ? Number(yearValue) : undefined;
  const yearFromValue = url.searchParams.get("yearFrom");
  const yearToValue = url.searchParams.get("yearTo");
  const requestedMode = url.searchParams.get("mode") || "hybrid";
  const mode = (["hybrid", "keyword", "semantic"].includes(requestedMode) ? requestedMode : "hybrid") as SearchMode;
  const title = url.searchParams.get("title") ?? undefined;

  return NextResponse.json({
    results: await hybridSearch(q, {
      year,
      yearFrom: yearFromValue ? Number(yearFromValue) : undefined,
      yearTo: yearToValue ? Number(yearToValue) : undefined,
      title,
      mode
    })
  });
}
