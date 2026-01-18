-- Fix RLS policies that use USING(true) for SELECT operations
-- These pre-existing policies were created before role-based access was implemented
-- We need to replace them with role-based access

-- ============================================
-- AP_INVOICES - Already has role-based policy, just drop the old one
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read AP invoices" ON ap_invoices;

-- ============================================
-- AP_PAYMENT_ALLOCATIONS - Already has role-based policy, just drop the old one
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read AP allocations" ON ap_payment_allocations;

-- ============================================
-- AP_PAYMENTS - Already has role-based policy, just drop the old one
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read AP payments" ON ap_payments;

-- ============================================
-- AR_INVOICES - Already has role-based policy, just drop the old one
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read AR invoices" ON ar_invoices;

-- ============================================
-- AR_RECEIPT_ALLOCATIONS - Already has role-based policy, just drop the old one
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read AR allocations" ON ar_receipt_allocations;

-- ============================================
-- AR_RECEIPTS - Already has role-based policy, just drop the old one
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read AR receipts" ON ar_receipts;

-- ============================================
-- ATTACHMENTS TABLE - Role-based access (FINANCE, ADMIN, SUPER_ADMIN)
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read attachments" ON attachments;

CREATE POLICY "Role-based attachments read access" ON attachments
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role) OR
    has_role(auth.uid(), 'PURCHASING'::user_role)
  );

-- ============================================
-- BILLING_EMAIL_LOGS TABLE - Role-based access (FINANCE, ADMIN, SUPER_ADMIN)
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read billing email logs" ON billing_email_logs;

CREATE POLICY "Role-based billing_email_logs read access" ON billing_email_logs
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- BILLING_LETTERS TABLE - Role-based access (FINANCE, ADMIN, SUPER_ADMIN)
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read billing letters" ON billing_letters;

CREATE POLICY "Role-based billing_letters read access" ON billing_letters
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- COMPANY_PROFILE TABLE - All authenticated users can read (needed for billing letters)
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read company_profile" ON company_profile;

CREATE POLICY "All authenticated users can read company_profile" ON company_profile
  FOR SELECT USING (auth.uid() IS NOT NULL);