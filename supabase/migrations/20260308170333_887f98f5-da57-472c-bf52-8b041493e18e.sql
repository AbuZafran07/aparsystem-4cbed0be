-- Create storage bucket for auto backups
INSERT INTO storage.buckets (id, name, public) VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for backups bucket: only SUPER_ADMIN can access
CREATE POLICY "Super Admin can manage backups" ON storage.objects
FOR ALL USING (
  bucket_id = 'backups' AND has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
) WITH CHECK (
  bucket_id = 'backups' AND has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
);

-- Create backup_logs table
CREATE TABLE IF NOT EXISTS public.backup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type text NOT NULL DEFAULT 'auto',
  file_path text,
  file_size bigint DEFAULT 0,
  table_counts jsonb,
  status text NOT NULL DEFAULT 'SUCCESS',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin can read backup_logs" ON public.backup_logs
FOR SELECT USING (has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

CREATE POLICY "System can insert backup_logs" ON public.backup_logs
FOR INSERT WITH CHECK (true);

-- Enable extensions for cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;