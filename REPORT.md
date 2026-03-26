# Job Hunt OS – Production Report

## Current Status

`my-service` is now running in the intended hosted mode:

- Railway runs the daily pipeline without your laptop being on
- SQLite remains the source of truth
- Litestream replicates SQLite to Cloudflare R2
- `scan` ingests YC, Greenhouse, and Lever in one run
- `briefing` sends a polished HTML email through Gmail
- `today` / `next` surfaces a ranked shortlist of actions

The core path is coherent again:

`fetch -> normalize -> score -> upsert -> shortlist -> briefing -> notify`

## What Is Working

### Hosted daily pipeline

The production worker runs:

1. [`scripts/start-with-litestream.sh`](/Users/anishpav/Anish_Personal_projects/my-service/scripts/start-with-litestream.sh)
2. restore `/app/data/job_hunt.db` from R2
3. `litestream replicate -exec "scripts/daily-pipeline.sh"`
4. [`scripts/daily-pipeline.sh`](/Users/anishpav/Anish_Personal_projects/my-service/scripts/daily-pipeline.sh), which runs:
   - `node dist/src/cli.js scan`
   - `node dist/src/cli.js briefing --no-scan`
5. Litestream syncs the updated DB back to R2

### Briefing artifact

The canonical daily artifact is now:

- a styled HTML email rendered by [`src/templates/briefing-email.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/templates/briefing-email.ts)
- sent through Gmail by [`src/integrations/gmail.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/integrations/gmail.ts)

`notify` resends the latest briefing window without rerunning the full pipeline.

### Action quality

The shortlist is no longer empty in production.

Recent Railway runs confirmed:

- nonzero `Best apply-now`
- HTML briefing email delivery
- Gmail draft creation
- persistent DB restore and update behavior across runs

The action ranking now:

- favors technical fit over preference-only signals
- penalizes soft-signal-only matches
- falls back to technically decent real roles if the stricter action queue would otherwise be empty

### Persistence

SQLite tables defined in [`src/db/schema.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/schema.ts) still drive:

- jobs
- scans
- applications
- application events
- follow-ups
- drafts

Later Railway runs showed mostly `updated` rows instead of treating everything as brand new, which confirms restore from R2 is actually working.

## Operational Workflow

### Daily hosted run

- Railway cron starts the worker
- Litestream restores the latest SQLite replica from R2
- `scan` refreshes jobs from YC, Greenhouse, and Lever
- scoring uses your saved profile from [`data/profile.json`](/Users/anishpav/Anish_Personal_projects/my-service/data/profile.json)
- `briefing` assembles:
  - newly discovered real roles
  - best apply-now roles
  - pending follow-ups
  - unsent drafts
- the worker renders and sends the HTML briefing email
- Litestream syncs the DB back to R2

### Manual local commands

The local CLI still uses the same SQLite model and works cleanly alongside the hosted worker:

- `npm run today`
- `npm run review`
- `npm run draft -- "Role Name" --save`
- `npm run apply -- "Role Name" --status applied`
- `npm run followups`
- `npm run stats`

## Railway Env Checklist

Required for the current hosted path:

- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `NOTIFY_EMAIL_TO`
- `LITESTREAM_REPLICA_URL`

Required for Cloudflare R2:

- `LITESTREAM_ACCESS_KEY_ID`
- `LITESTREAM_SECRET_ACCESS_KEY`
- `LITESTREAM_S3_ENDPOINT`

## Validation Runbook

After deploy, the fastest sanity check is:

1. run `railway logs`
2. confirm you see:
   - restore from replica
   - scan summary
   - briefing assembly counts
   - `Doc ready: ...`
   - `Gmail notification draft created: ...`
3. confirm the briefing email arrives
4. confirm the R2 bucket contains replica data

Healthy signs:

- later runs show mostly `updated` rows, not all `new`
- `Best apply-now` is nonzero
- the pipeline completes and exits cleanly enough for the next cron run

## Known Non-Fatal Issues

- Litestream can still log a shutdown warning:
  - `failed to close database: sql: transaction has already been committed or rolled back`
- Some runs may also log an early compaction warning before the DB is fully initialized

These currently appear noisy rather than destructive because:

- restore works
- replication works
- scan works
- briefing works
- briefing email delivery works
- Gmail draft creation works

## Remaining Product Gaps

- Ranking quality still has room to improve even though the shortlist is now populated
- Some external roles remain technically underspecified, which limits how strong stack-fit scoring can get
- The system is intentionally CLI-first and still does not expose a GUI or hosted dashboard

## Bottom Line

The system is now functioning in the intended “laptop off” mode:

- Railway cron execution
- durable SQLite through Litestream + R2
- HTML email daily briefing
- Gmail delivery
- actionable apply-now shortlist in production

The main remaining work is product polish, not infrastructure rescue.
