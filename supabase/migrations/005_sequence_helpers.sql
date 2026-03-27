BEGIN;

CREATE OR REPLACE FUNCTION public.reset_table_sequence(
  p_table_name TEXT,
  p_column_name TEXT DEFAULT 'id'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sequence_name TEXT;
  v_max_id BIGINT;
BEGIN
  SELECT pg_get_serial_sequence(format('public.%I', p_table_name), p_column_name)
    INTO v_sequence_name;

  IF v_sequence_name IS NULL THEN
    RAISE EXCEPTION 'No serial sequence found for %.%', p_table_name, p_column_name;
  END IF;

  EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM public.%I', p_column_name, p_table_name)
    INTO v_max_id;

  PERFORM setval(v_sequence_name, GREATEST(v_max_id, 1), true);

  RETURN v_max_id + 1;
END;
$$;

COMMENT ON FUNCTION public.reset_table_sequence(TEXT, TEXT)
IS 'Resets a SERIAL sequence after explicit-id backfills. Intended for one-time maintenance tasks such as SQLite -> Supabase migrations.';

COMMIT;
