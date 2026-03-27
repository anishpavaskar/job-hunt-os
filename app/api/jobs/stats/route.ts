import { getAnalyticsOverview } from "@/lib/server/web-data";
import { startApiRequest } from "@/lib/server/api-debug";

export const dynamic = "force-dynamic";

export async function GET() {
  const logger = startApiRequest("/api/jobs/stats");
  try {
    const data = await logger.query("getAnalyticsOverview", () => getAnalyticsOverview());
    logger.finish({
      totalRolesTracked: data.summary.totalRolesTracked,
      applicationsSent: data.summary.applicationsSent,
    });
    return Response.json(data);
  } catch (error) {
    logger.fail(error);
    throw error;
  }
}
