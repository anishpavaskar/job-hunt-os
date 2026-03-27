import { initDb } from "@/src/db";
import { startApiRequest } from "@/lib/server/api-debug";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();
  const logger = startApiRequest("/api/health");

  try {
    const db = await initDb();

    const [jobsCountResult, latestScanResult] = await Promise.all([
      logger.query("jobs_count", () => db.from("jobs").select("id", { count: "exact", head: true })),
      logger.query(
        "latest_scan",
        () => db
          .from("scans")
          .select("completed_at")
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    ]);
    const jobsCount = jobsCountResult.count;
    const jobsError = jobsCountResult.error;
    const latestScan = latestScanResult.data;
    const scanError = latestScanResult.error;

    if (jobsError) {
      throw new Error(`jobs query failed: ${jobsError.message}`);
    }
    if (scanError) {
      throw new Error(`latest scan query failed: ${scanError.message}`);
    }

    logger.finish({ jobsCount: jobsCount ?? 0, lastScan: latestScan?.completed_at ?? null });
    return Response.json({
      status: "ok",
      timestamp,
      jobs_count: jobsCount ?? 0,
      last_scan: latestScan?.completed_at ?? null,
    });
  } catch (error) {
    logger.fail(error);
    return Response.json(
      {
        status: "error",
        timestamp,
        jobs_count: null,
        last_scan: null,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
