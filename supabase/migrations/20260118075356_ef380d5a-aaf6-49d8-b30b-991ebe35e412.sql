-- Restrict audit log access to SUPER_ADMIN only
-- Drop the existing broad access policy
DROP POLICY IF EXISTS "Admin and Super Admin can read audit logs" ON public.audit_logs;

-- Create new restrictive policy for SUPER_ADMIN only
CREATE POLICY "Only Super Admin can read audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'SUPER_ADMIN'::user_role));