import { initDb } from "@/src/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const db = await initDb();

    const [{ count: jobsCount, error: jobsError }, { data: latestScan, error: scanError }] = await Promise.all([
      db.from("jobs").select("id", { count: "exact", head: true }),
      db
        .from("scans")
        .select("completed_at")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (jobsError) {
      throw new Error(`jobs query failed: ${jobsError.message}`);
    }
    if (scanError) {
      throw new Error(`latest scan query failed: ${scanError.message}`);
    }

    return Response.json({
      status: "ok",
      timestamp,
      jobs_count: jobsCount ?? 0,
      last_scan: latestScan?.completed_at ?? null,
    });
  } catch (error) {
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
