-- Helper used by the backup/restore edge function to whitelist restorable columns.
CREATE OR REPLACE FUNCTION public.get_restorable_columns(_table text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(column_name::text), ARRAY[]::text[])
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = _table
    AND is_generated = 'NEVER'
    AND is_identity = 'NO';
$$;

REVOKE ALL ON FUNCTION public.get_restorable_columns(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_restorable_columns(text) TO service_role;

-- Scheduled jobs must now authenticate with a shared secret header.
SELECT cron.unschedule('weekly-auto-backup');
SELECT cron.unschedule('salespulse-overdue-daily');

SELECT cron.schedule(
  'weekly-auto-backup',
  '0 2 * * 0',
  $job$
  SELECT net.http_post(
    url := 'https://qekexdtidnbspqzwerrd.supabase.co/functions/v1/backup-restore?action=auto-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'Qz4mEu1tTbXo8Kp2Ld93RaWv7YcHsN0gJ5fBiUeM'
    ),
    body := jsonb_build_object('time', 'auto')
  );
  $job$
);

SELECT cron.schedule(
  'salespulse-overdue-daily',
  '0 2 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://qekexdtidnbspqzwerrd.supabase.co/functions/v1/salespulse-overdue-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 's9fsR37u60Mvw76S1UVGlJEKx3Dk6ntVL6mnbqfm'
    ),
    body := jsonb_build_object('triggered_at', now())
  );
  $job$
);