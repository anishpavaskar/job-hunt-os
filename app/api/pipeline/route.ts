import type { NextRequest } from "next/server";
import { getPipelineBoardData } from "@/lib/server/pipeline-data";
import { startApiRequest } from "@/lib/server/api-debug";
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
  const logger = startApiRequest("/api/pipeline", {
    search: request.nextUrl.searchParams.get("search") ?? "",
    source: request.nextUrl.searchParams.get("source") ?? "all",
  });
  const params = request.nextUrl.searchParams;
  const sourceParam = params.get("source");
  const source = sourceParam && VALID_SOURCES.has(sourceParam as WebJobSource)
    ? sourceParam as WebJobSource
    : "all";

  try {
    const data = await logger.query("getPipelineBoardData", () => getPipelineBoardData({
      search: params.get("search") ?? "",
      source,
    }));
    logger.finish({ totalCards: data.totalCards });
    return Response.json(data);
  } catch (error) {
    logger.fail(error);
    throw error;
  }
}
