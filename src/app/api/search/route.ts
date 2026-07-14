import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { hybridSearch } from "@/server/search/search";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const yearValue = url.searchParams.get("year");
  const year = yearValue ? Number(yearValue) : undefined;
  const requestedScope = url.searchParams.get("scope") ?? "all";
  const scope = ["all", "mine", "family", "favorites"].includes(requestedScope)
    ? requestedScope as "all" | "mine" | "family" | "favorites"
    : "all";

  return NextResponse.json(await hybridSearch(user.id, q, { year, scope }));
}
