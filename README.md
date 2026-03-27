# Job Hunt Dashboard

`my-service` is a private single-user job hunt dashboard and pipeline. The CLI scans job sources, scores roles, and sends the daily briefing email; the built-in Next.js app reads the same Supabase-backed data and surfaces it as a dashboard you can deploy on Vercel.

## Local development

Create `.env.local` with your Supabase credentials and dashboard API key:

```bash
cp .env.example .env.local
```

Run the dashboard locally:

```bash
npm install
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

CLI pipeline commands still run from the same repo:

```bash
npm run scan
npm run briefing
```

## Deployment

1. Push this repo to GitHub.
2. Connect the repo in the Vercel dashboard.
3. Add the environment variables from `.env.example`.
4. Deploy.

Vercel config lives in `vercel.json` and pins the project to `sfo1`.

## Required environment variables

```bash
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DASHBOARD_API_KEY=
ANTHROPIC_API_KEY=
```

`DASHBOARD_API_KEY` protects `/api/health` through a simple header check. Send it as `x-dashboard-api-key` when calling the health endpoint from automation.

## Architecture

- Next.js App Router dashboard
- Supabase Postgres as the shared system of record
- Tailwind CSS for UI styling
- CLI pipeline for scan, score, briefing, and Gmail delivery

## Relationship to the pipeline

The pipeline writes data and the dashboard reads it.

- `npm run scan` pulls roles from the configured sources and stores them in Supabase.
- `npm run briefing` assembles and sends the daily email briefing.
- The dashboard reads those same tables through server-side API routes such as `/api/jobs`, `/api/pipeline`, and `/api/health`.
- `scripts/daily-pipeline.sh` can optionally call the deployed dashboard health endpoint after scan and briefing by setting `DASHBOARD_HEALTHCHECK_URL`. That smoke test is non-blocking.

## Health check

`/api/health` verifies the dashboard can reach Supabase and returns:

```json
{
  "status": "ok",
  "timestamp": "2026-03-27T00:00:00.000Z",
  "jobs_count": 123,
  "last_scan": "2026-03-27T00:00:00.000Z"
}
```
