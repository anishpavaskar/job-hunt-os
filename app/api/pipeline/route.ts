import type { NextRequest } from "next/server";
import { getPipelineBoardData } from "@/lib/server/pipeline-data";
import type { WebJobSource } from "@/lib/web/types";

export const dynamic = "force-dynamic";

const VALID_SOURCES = new Set<WebJobSource>([
  "yc",
  "greenhouse",
  "lever",
  "careers",
  "linkedin",
  "indeed",
]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sourceParam = params.get("source");
  const source = sourceParam && VALID_SOURCES.has(sourceParam as WebJobSource)
    ? sourceParam as WebJobSource
    : "all";

  const data = await getPipelineBoardData({
    search: params.get("search") ?? "",
    source,
  });

  return Response.json(data);
}
