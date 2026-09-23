-- backup_logs: only service_role (edge functions) writes these
DROP POLICY IF EXISTS "System can insert backup_logs" ON public.backup_logs;

-- salespulse logs: only service_role (edge functions) writes these
DROP POLICY IF EXISTS "System can insert overdue notified" ON public.salespulse_overdue_notified;
DROP POLICY IF EXISTS "System can insert webhook logs" ON public.salespulse_webhook_log;

-- audit_logs: the actor must be the signed-in user
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert their own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());

-- notifications: only internal users with an assigned role may create them
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
CREATE POLICY "Role holders can create notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
);