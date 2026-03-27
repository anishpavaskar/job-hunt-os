BEGIN;

-- Single-user setup for now: authenticated users can do everything.
-- This is intentionally permissive and should be tightened before any
-- multi-user rollout.

ALTER TABLE public.job_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baseline_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baseline_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_sources_authenticated_all ON public.job_sources;
CREATE POLICY job_sources_authenticated_all
  ON public.job_sources
  FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS scans_authenticated_all ON public.scans;
CREATE POLICY scans_authenticated_all
  ON public.scans
  FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS jobs_authenticated_all ON public.jobs;
CREATE POLICY jobs_authenticated_all
  ON public.jobs
  FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS applications_authenticated_all ON public.applications;
CREATE POLICY applications_authenticated_all
  ON public.applications
  FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS application_events_authenticated_all ON public.application_events;
CREATE POLICY application_events_authenticated_all
  ON public.application_events
  FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS followups_authenticated_all ON public.followups;
CREATE POLICY followups_authenticated_all
  ON public.followups
  FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS drafts_authenticated_all ON public.drafts;
CREATE POLICY drafts_authenticated_all
  ON public.drafts
  FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS baseline_snapshots_authenticated_all ON public.baseline_snapshots;
CREATE POLICY baseline_snapshots_authenticated_all
  ON public.baseline_snapshots
  FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS baseline_jobs_authenticated_all ON public.baseline_jobs;
CREATE POLICY baseline_jobs_authenticated_all
  ON public.baseline_jobs
  FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

COMMIT;
