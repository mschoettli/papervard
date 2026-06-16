import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { hybridSearch } from "@/server/search/search";

export async function GET(request: Request) {
  await requireUser();
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const yearValue = url.searchParams.get("year");
  const year = yearValue ? Number(yearValue) : undefined;

  return NextResponse.json({ results: await hybridSearch(q, year) });
}
