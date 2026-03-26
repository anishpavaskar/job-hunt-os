# Job Hunt OS

CLI-first pipeline for automated job scanning, scoring, briefing, and outreach.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Railway (cron)                     │
│                                                     │
│  ┌───────────┐    ┌───────────┐    ┌─────────────┐ │
│  │  scan      │───▶│  score    │───▶│  briefing   │ │
│  │ (Greenhouse│    │ (profile  │    │ (Claude AI  │ │
│  │  Lever,    │    │  match +  │    │  summary →  │ │
│  │  YC boards)│    │  rank)    │    │  Drive/SMS) │ │
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
npm run briefing          # Generate AI briefing
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
railway variables set GOOGLE_DRIVE_FOLDER_ID=...
railway variables set TWILIO_ACCOUNT_SID=...
railway variables set TWILIO_AUTH_TOKEN=...
railway variables set TWILIO_FROM_NUMBER=...
railway variables set MY_PHONE_NUMBER=...
railway variables set LITESTREAM_REPLICA_URL=s3://your-bucket/job-hunt-os/db
railway variables set CRON_SCHEDULE="0 14 * * *"
```

### 3. Deploy

```bash
railway up
```

### 4. Set up cron trigger

Railway doesn't run cron natively on all plans. Two options:

**Option A: Railway Cron Service (recommended)**
1. Go to your project in the Railway dashboard
2. Click **Settings** → **Cron**
3. Set schedule: `0 14 * * *` (7 AM PST = 2 PM UTC)

**Option B: External cron trigger**
Use a free cron service (cron-job.org, EasyCron) to hit your Railway deploy URL
on a schedule, or use GitHub Actions:

```yaml
# .github/workflows/daily-pipeline.yml
name: Daily Pipeline
on:
  schedule:
    - cron: '0 14 * * *'  # 7 AM PST
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST "${{ secrets.RAILWAY_DEPLOY_WEBHOOK }}"
```

## SQLite Persistence (Litestream)

The pipeline uses SQLite for local storage. In Railway (ephemeral containers),
data is preserved via [Litestream](https://litestream.io/) streaming replication:

1. **On start**: restore SQLite DB from S3/R2 replica
2. **During run**: continuously replicate changes
3. **On exit**: final sync to replica

Set `LITESTREAM_REPLICA_URL` to an S3-compatible bucket:
- AWS S3: `s3://bucket-name/job-hunt-os/db`
- Cloudflare R2: `s3://bucket-name/job-hunt-os/db` (with S3 compat endpoint)

For R2, also set:
```bash
railway variables set LITESTREAM_ACCESS_KEY_ID=...
railway variables set LITESTREAM_SECRET_ACCESS_KEY=...
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI briefings |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Yes | Google OAuth refresh token |
| `GOOGLE_DRIVE_FOLDER_ID` | Yes | Target folder for briefing docs |
| `TWILIO_ACCOUNT_SID` | No | Twilio account SID for SMS |
| `TWILIO_AUTH_TOKEN` | No | Twilio auth token |
| `TWILIO_FROM_NUMBER` | No | Twilio sender number |
| `MY_PHONE_NUMBER` | No | Your phone for SMS alerts |
| `LITESTREAM_REPLICA_URL` | No* | S3/R2 URL for DB replication |
| `CRON_SCHEDULE` | No | Cron expression (default: `0 14 * * *`) |

\* Required for Railway deployment (ephemeral filesystem).

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm run scan` | Scrape Greenhouse, Lever, YC job boards |
| `npm run briefing` | Generate AI-powered daily briefing |
| `npm run today` | Show today's top 10 matches |
| `npm run next` | Show next batch of matches |
| `npm run stats` | Show pipeline statistics |
| `npm run draft` | Draft an outreach message |
| `npm run drafts` | List pending drafts |
| `npm run apply` | Mark a job as applied |
| `npm run followups` | List follow-up actions |
| `npm run review` | Review a specific job |
| `npm run profile` | View/edit your profile |
| `npm run notify` | Send SMS notification |
| `npm run prospect-refresh` | Refresh prospect company list |
