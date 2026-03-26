# Job Hunt OS

CLI-first pipeline for automated job scanning, scoring, briefing, and outreach.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Railway (cron)                     │
│                                                     │
│  ┌───────────┐    ┌───────────┐    ┌─────────────┐ │
│  │  scan      │───▶│  score    │───▶│  briefing   │ │
│  │ (Greenhouse│    │ (profile  │    │ (HTML email │ │
│  │  Lever,    │    │  match +  │    │  + Gmail    │ │
│  │  YC boards)│    │  rank)    │    │  send)      │ │
│  └───────────┘    └───────────┘    └─────────────┘ │
│        │                                  │         │
│        ▼                                  ▼         │
│  ┌───────────┐                   ┌──────────────┐  │
│  │  SQLite    │◀── litestream ──▶│  S3 / R2     │  │
│  │  (local)   │    replication   │  (durable)   │  │
│  └───────────┘                   └──────────────┘  │
│                                                     │
│  Cron: 7 AM PST daily (0 14 * * * UTC)             │
└─────────────────────────────────────────────────────┘
```

## Local Development

```bash
# Install dependencies
npm install

# Copy env vars (fill in your keys)
cp .env.example .env

# Run individual commands
npm run scan              # Scrape job boards
npm run briefing          # Send today's HTML briefing email
npm run today             # Show today's top matches
npm run stats             # Pipeline statistics

# Run the full daily pipeline
./scripts/daily-pipeline.sh

# Run tests
npm test

# Typecheck
npm run typecheck
```

## Deployment (Railway)

### 1. Create Railway project

```bash
# Install Railway CLI
npm i -g @railway/cli
railway login
railway init
```

### 2. Link repo and set env vars

```bash
railway link
railway variables set ANTHROPIC_API_KEY=sk-...
railway variables set GOOGLE_CLIENT_ID=...
railway variables set GOOGLE_CLIENT_SECRET=...
railway variables set GOOGLE_REFRESH_TOKEN=...
railway variables set NOTIFY_EMAIL_TO=you@example.com
railway variables set LITESTREAM_REPLICA_URL=s3://your-bucket/job-hunt-os/db
```

### 3. Deploy

```bash
railway up
```

### 4. Set up cron trigger

Use Railway Cron Service:
1. Go to your project in the Railway dashboard
2. Click **Settings** → **Cron**
3. Set schedule: `0 14 * * *` (7 AM PST = 2 PM UTC)

## Production Runbook

### What a healthy Railway run looks like

After deploy or on the next cron run, check:

```bash
railway logs
```

You want to see:

- Litestream restore from replica
- `Scanned 3 sources...`
- briefing assembly counts
- `Doc ready: ...`
- `Gmail notification draft created: ...`

On the very first successful run you may see many `new` rows. On later healthy runs, persistence should show mostly `updated` rows because the SQLite replica is being restored correctly from R2.

### Quick post-deploy validation

1. Run `railway logs`
2. Confirm the briefing email arrives in your inbox
3. Confirm your R2 bucket contains Litestream replica objects

### Expected non-fatal warnings

You may still see Litestream noise such as:

- `failed to close database`
- an early compaction warning on startup

At the moment these appear non-fatal because restore, replication, scan, briefing, and Gmail draft creation all complete successfully.

## SQLite Persistence (Litestream)

The pipeline uses SQLite for local storage. In Railway (ephemeral containers),
data is preserved via [Litestream](https://litestream.io/) streaming replication:

1. **On start**: restore SQLite DB from S3/R2 replica
2. **During run**: continuously replicate changes
3. **On exit**: final sync to replica

Set `LITESTREAM_REPLICA_URL` to an S3-compatible bucket:
- AWS S3: `s3://bucket-name/job-hunt-os/db`
- Cloudflare R2: `s3://bucket-name/job-hunt-os/db`

For R2, also set:
```bash
railway variables set LITESTREAM_ACCESS_KEY_ID=...
railway variables set LITESTREAM_SECRET_ACCESS_KEY=...
railway variables set LITESTREAM_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI briefings |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Yes | Google OAuth refresh token |
| `NOTIFY_EMAIL_TO` | Yes | Email address that receives the briefing email |
| `LITESTREAM_REPLICA_URL` | No* | S3/R2 URL for DB replication |
| `LITESTREAM_S3_ENDPOINT` | No | Required for many R2 setups |
| `LITESTREAM_ACCESS_KEY_ID` | No | Required for private R2/S3 replication |
| `LITESTREAM_SECRET_ACCESS_KEY` | No | Required for private R2/S3 replication |

\* Required for Railway deployment (ephemeral filesystem).

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm run scan` | Scrape Greenhouse, Lever, YC job boards (`--slug-audit`, `--score-debug`) |
| `npm run briefing` | Send today's HTML briefing email via Gmail |
| `npm run today` | Show today's top 10 actions excluding company fallback roles |
| `npm run next` | Show next batch of matches |
| `npm run stats` | Show pipeline statistics |
| `npm run draft` | Draft an outreach message |
| `npm run drafts` | List pending drafts |
| `npm run apply` | Mark a job as applied |
| `npm run followups` | List follow-up actions |
| `npm run review` | Review a specific job |
| `npm run profile` | View/edit your profile |
| `npm run notify` | Resend the latest HTML briefing email without re-running the scan |
| `npm run prospect-refresh` | Refresh prospect company list |

`scan` now exposes `--slug-audit` (Greenhouse/Lever slug + HTTP info) and `--score-debug <selector>` for tracing score breakdowns. `briefing` keeps the 60+ score threshold for new-role email cards, excludes `company_fallback` rows unless you pass `--include-fallback`, renders the canonical HTML briefing, and sends it through Gmail. `today` mirrors the real-role default and adds an opt-in `--include-fallback` flag, so daily actions match the briefing surface. `notify` resends the latest HTML briefing window without rerunning the full pipeline.

## What This Tool Actually Does

You paste your resume/profile into `data/profile.json`, and the runner turns that into a structured profile (skills, target roles, preferences). `scan` then visits the boards you care about (YC, Greenhouse, Lever, custom sources) and deduplicates the best matches. Each day we synthesize the fit signals, apply/exclude company fallback rows, render a polished HTML briefing email, and send it through Gmail so you get a clean daily artifact even when your laptop is off.
