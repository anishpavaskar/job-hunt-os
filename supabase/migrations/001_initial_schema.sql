BEGIN;

CREATE TABLE IF NOT EXISTS public.job_sources (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_sources_provider_external_id_key UNIQUE (provider, external_id)
);

CREATE TABLE IF NOT EXISTS public.scans (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  raw_count INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  source_counts_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES public.job_sources(id),
  scan_id INTEGER NOT NULL REFERENCES public.scans(id),
  external_key TEXT NOT NULL,
  role_external_id TEXT,
  role_source TEXT NOT NULL DEFAULT 'company_fallback',
  company_name TEXT NOT NULL,
  title TEXT,
  summary TEXT NOT NULL,
  website TEXT NOT NULL,
  locations TEXT NOT NULL,
  remote_flag BOOLEAN NOT NULL DEFAULT FALSE,
  job_url TEXT NOT NULL DEFAULT '',
  posted_at TIMESTAMPTZ,
  regions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  industries_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  stage TEXT NOT NULL,
  batch TEXT NOT NULL,
  team_size INTEGER,
  seniority_hint TEXT,
  compensation_min INTEGER,
  compensation_max INTEGER,
  compensation_currency TEXT,
  compensation_period TEXT,
  extracted_skills_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_company BOOLEAN NOT NULL DEFAULT FALSE,
  is_hiring BOOLEAN NOT NULL DEFAULT FALSE,
  score INTEGER NOT NULL,
  score_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  score_breakdown_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  explanation_bullets_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_bullets_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jobs_external_key_key UNIQUE (external_key)
);

CREATE TABLE IF NOT EXISTS public.applications (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  applied_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  notes TEXT,
  applied_url TEXT,
  resume_version TEXT,
  outreach_draft_version TEXT,
  response_received BOOLEAN NOT NULL DEFAULT FALSE,
  response_type TEXT,
  interview_stage TEXT,
  rejection_reason TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.application_events (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  next_status TEXT,
  note TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.followups (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES public.applications(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.drafts (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES public.applications(id) ON DELETE SET NULL,
  variant TEXT NOT NULL DEFAULT 'default',
  generated_content TEXT NOT NULL,
  edited_content TEXT,
  gmail_draft_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT drafts_job_id_variant_key UNIQUE (job_id, variant)
);

CREATE TABLE IF NOT EXISTS public.baseline_snapshots (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.baseline_jobs (
  baseline_id INTEGER NOT NULL REFERENCES public.baseline_snapshots(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  score_snapshot INTEGER NOT NULL,
  status_snapshot TEXT NOT NULL,
  role_source_snapshot TEXT NOT NULL,
  posted_at_snapshot TIMESTAMPTZ,
  discovered_at_snapshot TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (baseline_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_score ON public.jobs(score DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_source_id ON public.jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_application_events_application_id ON public.application_events(application_id, created_at);
CREATE INDEX IF NOT EXISTS idx_followups_due ON public.followups(status, due_at);
CREATE INDEX IF NOT EXISTS idx_drafts_job_id ON public.drafts(job_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_application_id ON public.drafts(application_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_baseline_jobs_baseline_id ON public.baseline_jobs(baseline_id, score_snapshot DESC);

COMMIT;
