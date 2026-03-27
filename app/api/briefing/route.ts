import { getBriefingDashboardData } from "@/lib/server/briefing-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getBriefingDashboardData();
  return Response.json(data);
}
