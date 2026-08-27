import { NextResponse, type NextRequest } from "next/server";
import { search } from "@/engine/search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ error: "Missing required query parameter 'q'." }, { status: 400 });
  }
  try {
    const result = await search(q);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/search] failed:", err);
    return NextResponse.json(
      { error: "Search failed.", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
