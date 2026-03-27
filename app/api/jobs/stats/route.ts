import { getAnalyticsOverview } from "@/lib/server/web-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getAnalyticsOverview();
  return Response.json(data);
}
