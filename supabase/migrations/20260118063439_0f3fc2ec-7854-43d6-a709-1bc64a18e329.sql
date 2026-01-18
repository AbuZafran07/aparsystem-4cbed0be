-- Fix overly permissive RLS policies by implementing role-based access control
-- Using correct has_role signature: has_role(_user_id uuid, _role user_role)

-- ============================================
-- PROFILES TABLE - Users see own, SUPER_ADMIN sees all, ADMIN sees all for user management
-- ============================================
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Super Admin can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON profiles;

CREATE POLICY "Users view own or admins view all profiles" ON profiles
  FOR SELECT USING (
    auth.uid() = user_id OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role)
  );

-- ============================================
-- CUSTOMERS TABLE - FINANCE, ADMIN, SUPER_ADMIN only
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read customers" ON customers;
DROP POLICY IF EXISTS "Auth users can manage customers" ON customers;

CREATE POLICY "Role-based customer read access" ON customers
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based customer insert access" ON customers
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based customer update access" ON customers
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based customer delete access" ON customers
  FOR DELETE USING (
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- VENDORS TABLE - PURCHASING, ADMIN, SUPER_ADMIN only
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read vendors" ON vendors;
DROP POLICY IF EXISTS "Auth users can manage vendors" ON vendors;

CREATE POLICY "Role-based vendor read access" ON vendors
  FOR SELECT USING (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based vendor insert access" ON vendors
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based vendor update access" ON vendors
  FOR UPDATE USING (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based vendor delete access" ON vendors
  FOR DELETE USING (
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- BANK_ACCOUNTS TABLE - FINANCE, ADMIN, SUPER_ADMIN only
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read bank_accounts" ON bank_accounts;
DROP POLICY IF EXISTS "Auth users can manage bank_accounts" ON bank_accounts;

CREATE POLICY "Role-based bank_accounts read access" ON bank_accounts
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based bank_accounts insert access" ON bank_accounts
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based bank_accounts update access" ON bank_accounts
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based bank_accounts delete access" ON bank_accounts
  FOR DELETE USING (
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- AP_INVOICES TABLE - PURCHASING, FINANCE, ADMIN, SUPER_ADMIN
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read ap_invoices" ON ap_invoices;
DROP POLICY IF EXISTS "Auth users can manage ap_invoices" ON ap_invoices;

CREATE POLICY "Role-based ap_invoices read access" ON ap_invoices
  FOR SELECT USING (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR 
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ap_invoices insert access" ON ap_invoices
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR 
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ap_invoices update access" ON ap_invoices
  FOR UPDATE USING (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR 
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ap_invoices delete access" ON ap_invoices
  FOR DELETE USING (
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- AR_INVOICES TABLE - FINANCE, ADMIN, SUPER_ADMIN only
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read ar_invoices" ON ar_invoices;
DROP POLICY IF EXISTS "Auth users can manage ar_invoices" ON ar_invoices;

CREATE POLICY "Role-based ar_invoices read access" ON ar_invoices
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ar_invoices insert access" ON ar_invoices
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ar_invoices update access" ON ar_invoices
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ar_invoices delete access" ON ar_invoices
  FOR DELETE USING (
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- AP_PAYMENTS TABLE - PURCHASING, FINANCE, ADMIN, SUPER_ADMIN
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read ap_payments" ON ap_payments;
DROP POLICY IF EXISTS "Auth users can manage ap_payments" ON ap_payments;

CREATE POLICY "Role-based ap_payments read access" ON ap_payments
  FOR SELECT USING (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR 
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ap_payments insert access" ON ap_payments
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR 
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ap_payments update access" ON ap_payments
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ap_payments delete access" ON ap_payments
  FOR DELETE USING (
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- AR_RECEIPTS TABLE - FINANCE, ADMIN, SUPER_ADMIN
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read ar_receipts" ON ar_receipts;
DROP POLICY IF EXISTS "Auth users can manage ar_receipts" ON ar_receipts;

CREATE POLICY "Role-based ar_receipts read access" ON ar_receipts
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ar_receipts insert access" ON ar_receipts
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ar_receipts update access" ON ar_receipts
  FOR UPDATE USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ar_receipts delete access" ON ar_receipts
  FOR DELETE USING (
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- AP_PAYMENT_ALLOCATIONS TABLE - Same as AP_PAYMENTS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read ap_payment_allocations" ON ap_payment_allocations;
DROP POLICY IF EXISTS "Auth users can manage ap_payment_allocations" ON ap_payment_allocations;

CREATE POLICY "Role-based ap_payment_allocations read access" ON ap_payment_allocations
  FOR SELECT USING (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR 
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ap_payment_allocations insert access" ON ap_payment_allocations
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'PURCHASING'::user_role) OR 
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ap_payment_allocations delete access" ON ap_payment_allocations
  FOR DELETE USING (
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- AR_RECEIPT_ALLOCATIONS TABLE - Same as AR_RECEIPTS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read ar_receipt_allocations" ON ar_receipt_allocations;
DROP POLICY IF EXISTS "Auth users can manage ar_receipt_allocations" ON ar_receipt_allocations;

CREATE POLICY "Role-based ar_receipt_allocations read access" ON ar_receipt_allocations
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ar_receipt_allocations insert access" ON ar_receipt_allocations
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based ar_receipt_allocations delete access" ON ar_receipt_allocations
  FOR DELETE USING (
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- SALES TABLE - FINANCE, ADMIN, SUPER_ADMIN
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read sales" ON sales;
DROP POLICY IF EXISTS "Auth users can manage sales" ON sales;

CREATE POLICY "Role-based sales read access" ON sales
  FOR SELECT USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR 
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based sales insert access" ON sales
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based sales update access" ON sales
  FOR UPDATE USING (
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based sales delete access" ON sales
  FOR DELETE USING (
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- ============================================
-- PAYMENT_TERMS TABLE - All roles can read (needed for invoice creation), only ADMIN+ can modify
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read payment_terms" ON payment_terms;
DROP POLICY IF EXISTS "Auth users can manage payment_terms" ON payment_terms;

CREATE POLICY "All authenticated users can read payment_terms" ON payment_terms
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Role-based payment_terms insert access" ON payment_terms
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based payment_terms update access" ON payment_terms
  FOR UPDATE USING (
    has_role(auth.uid(), 'ADMIN'::user_role) OR 
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Role-based payment_terms delete access" ON payment_terms
  FOR DELETE USING (
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );