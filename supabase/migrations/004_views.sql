BEGIN;

CREATE OR REPLACE VIEW public.v_jobs_ranked AS
SELECT
  jobs.*,
  job_sources.provider,
  job_sources.external_id,
  job_sources.url AS source_url
FROM public.jobs
JOIN public.job_sources ON job_sources.id = jobs.source_id
ORDER BY jobs.score DESC, jobs.updated_at DESC, jobs.id DESC;

CREATE OR REPLACE VIEW public.v_pipeline AS
SELECT
  jobs.id AS job_id,
  jobs.external_key,
  jobs.company_name,
  jobs.title,
  jobs.score,
  jobs.status AS job_status,
  job_sources.provider,
  job_sources.external_id,
  applications.id AS application_id,
  applications.status AS application_status,
  COALESCE(applications.status, jobs.status) AS workflow_state,
  applications.applied_at,
  applications.applied_url,
  applications.response_received,
  applications.response_type,
  applications.interview_stage,
  applications.last_contacted_at,
  applications.updated_at AS application_updated_at,
  jobs.updated_at AS job_updated_at
FROM public.jobs
JOIN public.job_sources ON job_sources.id = jobs.source_id
LEFT JOIN public.applications ON applications.job_id = jobs.id;

CREATE OR REPLACE VIEW public.v_daily_new AS
SELECT
  jobs.*,
  job_sources.provider,
  job_sources.external_id,
  job_sources.url AS source_url
FROM public.jobs
JOIN public.job_sources ON job_sources.id = jobs.source_id
WHERE jobs.created_at >= CURRENT_DATE
  AND jobs.score >= 60
  AND jobs.role_source != 'company_fallback'
ORDER BY jobs.score DESC, jobs.created_at DESC;

CREATE OR REPLACE VIEW public.v_followups_due AS
SELECT
  followups.*,
  jobs.company_name,
  jobs.title,
  jobs.score,
  jobs.status AS job_status,
  applications.status AS application_status
FROM public.followups
JOIN public.jobs ON jobs.id = followups.job_id
LEFT JOIN public.applications ON applications.id = followups.application_id
WHERE followups.status = 'pending'
  AND followups.due_at <= CURRENT_DATE + INTERVAL '1 day'
ORDER BY followups.due_at ASC, jobs.score DESC;

COMMIT;
