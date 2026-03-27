import { getBriefingDashboardData } from "@/lib/server/briefing-data";
import { startApiRequest } from "@/lib/server/api-debug";

export const dynamic = "force-dynamic";

export async function GET() {
  const logger = startApiRequest("/api/briefing");
  try {
    const data = await logger.query("getBriefingDashboardData", () => getBriefingDashboardData());
    logger.finish({
      highPriorityRoles: data.highPriorityRoles.length,
      newTodayRoles: data.newTodayRoles.length,
      followups: data.followups.length,
      drafts: data.drafts.length,
    });
    return Response.json(data);
  } catch (error) {
    logger.fail(error);
    throw error;
  }
}
