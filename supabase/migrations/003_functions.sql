BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_job_source(
  p_provider TEXT,
  p_external_id TEXT,
  p_url TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_id INTEGER;
BEGIN
  INSERT INTO public.job_sources (provider, external_id, url, updated_at)
  VALUES (p_provider, p_external_id, p_url, NOW())
  ON CONFLICT (provider, external_id)
  DO UPDATE
    SET url = EXCLUDED.url,
        updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_job(
  p_source_id INTEGER,
  p_scan_id INTEGER,
  p_external_key TEXT,
  p_role_external_id TEXT,
  p_role_source TEXT,
  p_company_name TEXT,
  p_title TEXT,
  p_summary TEXT,
  p_website TEXT,
  p_locations TEXT,
  p_remote_flag BOOLEAN,
  p_job_url TEXT,
  p_posted_at TIMESTAMPTZ,
  p_regions_json JSONB,
  p_tags_json JSONB,
  p_industries_json JSONB,
  p_stage TEXT,
  p_batch TEXT,
  p_team_size INTEGER,
  p_seniority_hint TEXT,
  p_compensation_min INTEGER,
  p_compensation_max INTEGER,
  p_compensation_currency TEXT,
  p_compensation_period TEXT,
  p_extracted_skills_json JSONB,
  p_top_company BOOLEAN,
  p_is_hiring BOOLEAN,
  p_score INTEGER,
  p_score_reasons_json JSONB,
  p_score_breakdown_json JSONB,
  p_explanation_bullets_json JSONB,
  p_risk_bullets_json JSONB,
  p_status TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_id INTEGER;
BEGIN
  INSERT INTO public.jobs (
    source_id,
    scan_id,
    external_key,
    role_external_id,
    role_source,
    company_name,
    title,
    summary,
    website,
    locations,
    remote_flag,
    job_url,
    posted_at,
    regions_json,
    tags_json,
    industries_json,
    stage,
    batch,
    team_size,
    seniority_hint,
    compensation_min,
    compensation_max,
    compensation_currency,
    compensation_period,
    extracted_skills_json,
    top_company,
    is_hiring,
    score,
    score_reasons_json,
    score_breakdown_json,
    explanation_bullets_json,
    risk_bullets_json,
    status,
    updated_at
  ) VALUES (
    p_source_id,
    p_scan_id,
    p_external_key,
    p_role_external_id,
    p_role_source,
    p_company_name,
    p_title,
    p_summary,
    p_website,
    p_locations,
    p_remote_flag,
    p_job_url,
    p_posted_at,
    COALESCE(p_regions_json, '[]'::jsonb),
    COALESCE(p_tags_json, '[]'::jsonb),
    COALESCE(p_industries_json, '[]'::jsonb),
    p_stage,
    p_batch,
    p_team_size,
    p_seniority_hint,
    p_compensation_min,
    p_compensation_max,
    p_compensation_currency,
    p_compensation_period,
    COALESCE(p_extracted_skills_json, '[]'::jsonb),
    COALESCE(p_top_company, FALSE),
    COALESCE(p_is_hiring, FALSE),
    p_score,
    COALESCE(p_score_reasons_json, '[]'::jsonb),
    COALESCE(p_score_breakdown_json, '{}'::jsonb),
    COALESCE(p_explanation_bullets_json, '[]'::jsonb),
    COALESCE(p_risk_bullets_json, '[]'::jsonb),
    COALESCE(p_status, 'new'),
    NOW()
  )
  ON CONFLICT (external_key)
  DO UPDATE
    SET scan_id = EXCLUDED.scan_id,
        role_external_id = EXCLUDED.role_external_id,
        role_source = EXCLUDED.role_source,
        company_name = EXCLUDED.company_name,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        website = EXCLUDED.website,
        locations = EXCLUDED.locations,
        remote_flag = EXCLUDED.remote_flag,
        job_url = EXCLUDED.job_url,
        posted_at = COALESCE(EXCLUDED.posted_at, public.jobs.posted_at),
        regions_json = EXCLUDED.regions_json,
        tags_json = EXCLUDED.tags_json,
        industries_json = EXCLUDED.industries_json,
        stage = EXCLUDED.stage,
        batch = EXCLUDED.batch,
        team_size = EXCLUDED.team_size,
        seniority_hint = EXCLUDED.seniority_hint,
        compensation_min = EXCLUDED.compensation_min,
        compensation_max = EXCLUDED.compensation_max,
        compensation_currency = EXCLUDED.compensation_currency,
        compensation_period = EXCLUDED.compensation_period,
        extracted_skills_json = EXCLUDED.extracted_skills_json,
        top_company = EXCLUDED.top_company,
        is_hiring = EXCLUDED.is_hiring,
        score = EXCLUDED.score,
        score_reasons_json = EXCLUDED.score_reasons_json,
        score_breakdown_json = EXCLUDED.score_breakdown_json,
        explanation_bullets_json = EXCLUDED.explanation_bullets_json,
        risk_bullets_json = EXCLUDED.risk_bullets_json,
        updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMIT;
