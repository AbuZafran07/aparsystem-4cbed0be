# AP/AR Nexus

LOVABLE FINAL MASTER PROMPT (ONE COPY–PASTE, FULLY ALIGNED)
EN/ID Bilingual UI + Locked Labels + Canonical Keys + SQL Schema + AP/AR + Billing PDF + Email + Import/Export + NO REGISTER + Super Admin Only




You are a Senior Full-Stack Engineer, Enterprise UI/UX Designer, and Database Architect.
Build an INTERNAL enterprise finance system for PT. Kemika Karya Pratama:




APP NAME:
“AP/AR HUB – Finance System”




This is NOT a public app. It is an internal company system.
NO public registration. NO sign-up. NO self-register.




=====================================================
A) ALIGNMENT STANDARD (MUST BE CONSISTENT)
=====================================================
Use ONE canonical “data language” across database + API:
- Canonical backend keys = ENGLISH snake_case




UI is bilingual (EN/ID) but must only change displayed text.
Stored data keys MUST remain canonical keys.




Excel templates must use INDONESIAN human-readable headers EXACTLY as specified,
and the system must map those headers to canonical keys internally.




=====================================================
B) DESIGN SYSTEM + LAYOUT (MATCH SAMPLE)
=====================================================
Theme:
- Primary Green: #1F5A45
- Sidebar Dark: #111827
- Background: #F6F7FB
- Card: #FFFFFF
- Border: #E5E7EB
- Text Primary: #111827
- Text Secondary: #6B7280
- Success: #16A34A
- Warning: #F59E0B
- Danger: #EF4444
- Info: #3B82F6




Typography:
- Inter (fallback system sans)
- Headings 24–44px, semi-bold; Body 14–16px
Radius:
- Card radius 14px; input/button radius 10px
Icons:
- Lucide-like outline; sidebar icons 18–20px




B1) LOGIN SCREEN (SPLIT SCREEN LIKE SAMPLE)
- 100vh split: Left 46% / Right 54%
LEFT panel:
- background #1F5A45 with subtle gradient
- top-left: logo (44x44) + “NEMIKA” + “PT. Kemika Karya Pratama”
- big headline: “Enterprise AP/AR System”
- subtext: “Manage vendor payables, customer receivables, billing letters, approvals, and reports in one integrated platform.”
- bottom stats: “4 Roles”, “100% Paperless”, “Real-time Tracking”
RIGHT panel:
- centered login card width 420px, radius 14px, border #E5E7EB, soft shadow
- fields: Email, Password (show/hide)
- button: “Sign In”
- info box (NOT clickable): “Don’t have an account? Please contact the Super Admin to create a new account.”
IMPORTANT: no register links/buttons anywhere.




B2) APP LAYOUT (SIDEBAR + TOPBAR LIKE SAMPLE)
- Sidebar fixed left width 260px (#111827)
- Topbar height 56px with user name + role badge + red Logout button
- Main content uses KPI cards + tables (enterprise dashboard style)
- Sidebar has layered section headers (OVERVIEW/TRANSACTIONS/BILLING/MASTER DATA/REPORTS/SYSTEM)
- Active item indicator: left border 3px (#22C55E)




=====================================================
C) AUTH POLICY (STRICT NO REGISTER) + SEED SUPER ADMIN
=====================================================
- Login only (email + password)
- No register/sign-up endpoint or UI
- All user accounts must be created ONLY by SUPER_ADMIN in “User Management”
- Enforce RBAC on BOTH UI and API (backend must block unauthorized endpoints)




Seed SUPER ADMIN (mandatory):
Email/Username: ferry@kemika.co.id
Password: Ksatria2312
Role: SUPER_ADMIN
Status: ACTIVE
- Store password hashed
- Never display password
- Log every Super Admin action as SUPER_ADMIN_ACTION in audit logs




Roles:
- PURCHASING
- FINANCE
- ADMIN
- SUPER_ADMIN




=====================================================
D) LOCKED UI TEXT (BILINGUAL EN/ID) + LANGUAGE TOGGLE
=====================================================
- Add topbar toggle “EN | ID”
- Default language: ID
- Switching language changes ONLY UI text, not stored data.




IMPORTANT: Use EXACT menu labels and button texts as below (do not rename).




SIDEBAR SECTION HEADERS:
EN: OVERVIEW | TRANSACTIONS | BILLING | MASTER DATA | REPORTS | SYSTEM
ID: RINGKASAN | TRANSAKSI | PENAGIHAN | MASTER DATA | LAPORAN | SISTEM




MENU ITEMS (LOCKED):
Dashboard
EN: Accounts Payable (AP) | ID: Hutang Vendor (AP)
EN: Accounts Receivable (AR) | ID: Piutang Customer (AR)
EN: AP Payments | ID: Pembayaran AP
EN: AR Receipts | ID: Penerimaan AR
EN: Billing Letters | ID: Surat Tagihan
EN: Billing Email Logs | ID: Log Email Tagihan
EN: Vendors | ID: Vendor
EN: Customers | ID: Customer
EN: Sales | ID: Sales
EN: Payment Terms | ID: Termin Pembayaran
EN: Bank Accounts | ID: Rekening Bank
EN: Company Profile | ID: Profil Perusahaan
EN: AP Aging | ID: Aging AP
EN: AR Aging | ID: Aging AR
EN: AP Report | ID: Laporan AP
EN: AR Report | ID: Laporan AR
EN: Cashflow | ID: Arus Kas
EN: Export Center | ID: Pusat Ekspor
EN: Import/Export Center | ID: Pusat Impor/Ekspor
EN: Audit Logs | ID: Log Audit
EN: User Management | ID: Manajemen User
EN: System Settings | ID: Pengaturan Sistem




BUTTONS (LOCKED):
EN/ID:
Save/Simpan
Cancel/Batal
Close/Tutup
Back/Kembali
Submit/Ajukan
Approve/Setujui
Reject/Tolak
View/Lihat
Edit/Ubah
Delete/Hapus
Download/Unduh
Upload/Unggah
Export/Ekspor
Import/Impor
Preview/Pratinjau
Confirm/Konfirmasi
Logout/Keluar




AP ACTION BUTTONS (LOCKED):
EN: New AP Invoice | ID: AP Baru
EN: Record Payment | ID: Catat Pembayaran




AR ACTION BUTTONS (LOCKED):
EN: New AR Invoice | ID: AR Baru
EN: Record Receipt | ID: Catat Penerimaan
EN: Generate Billing Letter | ID: Buat Surat Tagihan
EN: Send Billing Email | ID: Kirim Email Tagihan




LOGIN TEXT (LOCKED):
EN: Sign In to Your Account | ID: Masuk ke Akun
EN: Use the email and password provided by the administrator | ID: Gunakan email dan password yang diberikan administrator
EN: Don’t have an account? Please contact the Super Admin to create a new account. | ID: Tidak memiliki akun? Hubungi Super Admin untuk pembuatan akun baru.




=====================================================
E) ROLE-BASED MENU VISIBILITY (RBAC)
=====================================================
PURCHASING can ONLY see:
- Dashboard
- Accounts Payable (AP)




FINANCE can see:
- Dashboard
- AP, AR
- AP Payments, AR Receipts
- Billing Letters, Billing Email Logs
- Reports, Export Center
- Import/Export Center
- Audit Logs (read)




ADMIN can see:
- Dashboard
- Master Data
- Import/Export Center
- Audit Logs
- (Transactions read-only; editing only if status != PAID with reason)




SUPER_ADMIN can see everything including:
- User Management
- System Settings
- Full Audit Logs




=====================================================
F) CANONICAL DATA KEYS (BACKEND KEYS)
=====================================================
AP Invoice canonical keys:
vendor_name, sp_po_date, po_number, product_name, terms_name,
vendor_invoice_number, invoice_date, due_date,
invoice_amount, paid_amount, outstanding_amount, overdue_amount, overdue_days,
status, paid_date, notes




AR Invoice canonical keys:
sales_name, sp_po_date, order_number, customer_name, terms_name,
invoice_number, invoice_date, due_date,
invoice_amount, paid_amount, outstanding_amount, overdue_amount, overdue_days,
status, paid_date, notes




=====================================================
G) AP MODULE (ACCOUNTS PAYABLE)
=====================================================
- Purchasing creates AP in DRAFT.
- Purchasing can edit only DRAFT or REJECTED.
- Purchasing can SUBMIT.
- Finance can APPROVE/REJECT (REJECT requires reason).
- Finance records payments (partial/full).
- Status flow: DRAFT → SUBMITTED → APPROVED → PARTIAL → PAID (plus REJECTED)
- PAID is locked (read-only).
- Unique rule: (vendor_name + vendor_invoice_number) must be unique.




Attachments for AP:
- invoice, PO, GR, payment proof (upload manually, not via Excel).




=====================================================
H) AR MODULE (ACCOUNTS RECEIVABLE)
=====================================================
- Finance creates AR invoice.
- Finance submits/approves.
- Finance generates Billing Letter PDF.
- Finance sends Billing Email with PDF attached.
- Finance records receipts (partial/full).
- Status flow: DRAFT → SUBMITTED → APPROVED → PARTIAL → PAID (plus REJECTED)
- PAID locked (read-only).
- Unique rule: (customer_name + invoice_number) must be unique.




Attachments for AR:
- invoice, order docs, receipt proof (upload manually, not via Excel).




=====================================================
I) AUTO CALCULATIONS (MANDATORY)
=====================================================
For AP and AR:
paid_amount = sum(payment/receipt allocations)
outstanding_amount = invoice_amount - paid_amount
overdue_amount = outstanding_amount if today > due_date and outstanding_amount > 0 else 0
overdue_days = (today - due_date) if overdue_amount > 0 else 0
paid_date is set automatically when status becomes PAID (date of final transaction).




=====================================================
J) BILLING LETTER (AR PDF) – MANDATORY
=====================================================
- Generate A4 corporate PDF with company header (logo/name/address/contact).
- Auto numbering: BL-YYYYMM-#### (monthly counter).
- Invoice detail table: invoice_number, invoice_date, due_date, invoice_amount, paid_amount, outstanding_amount, overdue_days, status.
- Payment instruction box: bank name, account no, account name + transfer note “invoice_number – customer_name”.
- Formal closing + finance signature (digital).
- Multiple letters allowed per invoice; history saved.
- Store PDF as attachment linked to billing letter + AR invoice.
- Letter status: DRAFT / SENT / PAID.




=====================================================
K) BILLING EMAIL (AR) – MANDATORY
=====================================================
- Formal email content with bilingual support (EN/ID). Default: Indonesian.
- Dynamic subject based on due/overdue:
  - Due soon
  - Due today
  - Overdue (include overdue_days)
- Attach billing PDF automatically.
- Log email: to, cc, subject, status SENT/FAILED, error message, sent_by, sent_at.
- Disable send when invoice PAID.




=====================================================
L) IMPORT/EXPORT CENTER (STRICT TEMPLATE, INDONESIAN HEADERS)
=====================================================
Provide official Excel templates and enforce exact headers and column order.
No flexible headers.




IMPORT_AP.xlsx
Sheet: AP
Headers EXACT order (Indonesian human readable):
1) Nama Vendor
2) Tanggal SP/PO
3) Nomor Purchase Order
4) Nama Produk
5) Terms
6) No. Invoice Vendor
7) Tanggal Invoice
8) Tanggal Jatuh Tempo
9) Nilai Invoice
10) Nilai Invoice Sudah Lunas
11) Keterangan




Map headers to canonical keys:
Nama Vendor -> vendor_name
Tanggal SP/PO -> sp_po_date
Nomor Purchase Order -> po_number
Nama Produk -> product_name
Terms -> terms_name
No. Invoice Vendor -> vendor_invoice_number
Tanggal Invoice -> invoice_date
Tanggal Jatuh Tempo -> due_date
Nilai Invoice -> invoice_amount
Nilai Invoice Sudah Lunas -> paid_amount
Keterangan -> notes




IMPORT_AR.xlsx
Sheet: AR
Headers EXACT order:
1) Nama Sales
2) Tanggal SP/PO
3) Nomor Surat Pesanan
4) Nama Customer
5) Terms
6) No. Invoice
7) Tanggal Invoice
8) Tanggal Jatuh Tempo
9) Nilai Invoice
10) Nilai Invoice Sudah Lunas
11) Keterangan




Map headers to canonical keys:
Nama Sales -> sales_name
Tanggal SP/PO -> sp_po_date
Nomor Surat Pesanan -> order_number
Nama Customer -> customer_name
Terms -> terms_name
No. Invoice -> invoice_number
Tanggal Invoice -> invoice_date
Tanggal Jatuh Tempo -> due_date
Nilai Invoice -> invoice_amount
Nilai Invoice Sudah Lunas -> paid_amount
Keterangan -> notes




Import rules:
- Date format: YYYY-MM-DD
- Numeric: plain number (no thousand separators)
- Default imported status: DRAFT
- Prevent duplicates:
  AP: vendor_name + vendor_invoice_number
  AR: customer_name + invoice_number
- Attachments not imported via Excel
- Import flow: Upload -> Validate -> Preview -> Confirm
- Atomic import: if any row fails validation, cancel entire batch
- Provide row-level error list + downloadable error report
- Log import batch: who, when, file, total rows, success/fail, errors




Export rules:
- Export AP/AR/Vendors/Customers to Excel
- Allow filters (date range, status, vendor/customer)




=====================================================
M) DASHBOARD (LIKE SAMPLE)
=====================================================
Finance Dashboard KPI cards:
- Total AP Outstanding
- Total AR Outstanding
- AP Overdue
- AR Overdue
Charts:
- Aging buckets: 0–30 / 31–60 / 61–90 / 90+
Tables:
- AP Due Soon
- AR Overdue with quick actions:
  - Generate Billing Letter
  - Send Billing Email




Purchasing Dashboard:
- AP Draft count
- AP Submitted count
- AP list needing follow-up




Admin/Super Admin:
- system overview widgets
- audit summary




=====================================================
N) AUDIT LOGS (MANDATORY)
=====================================================
Audit critical actions:
- login/logout
- create/edit/submit
- approve/reject + reason
- payment/receipt + allocations
- generate billing PDF
- send billing email
- import/export
- user management actions
Store: actor, role, timestamp, action, entity, before/after JSON, reason.
Flag Super Admin actions as SUPER_ADMIN_ACTION.




=====================================================
O) DATABASE (POSTGRES SQL SCHEMA REQUIRED)
=====================================================
Use PostgreSQL and create tables according to the following DDL.
(Use this schema and keep canonical keys.)




--- SQL DDL START ---
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";




DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('PURCHASING','FINANCE','ADMIN','SUPER_ADMIN');
  END IF;




  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'record_status') THEN
    CREATE TYPE record_status AS ENUM ('DRAFT','SUBMITTED','APPROVED','REJECTED','PARTIAL','PAID','CANCELLED');
  END IF;




  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_status') THEN
    CREATE TYPE email_status AS ENUM ('SENT','FAILED');
  END IF;
END$$;




CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          user_role NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NULL
);




CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_name text NOT NULL UNIQUE,
  address text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name text NOT NULL UNIQUE,
  billing_email text,
  address text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sales_name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS payment_terms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  terms_name text NOT NULL UNIQUE,
  days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS company_profile (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_name text NOT NULL DEFAULT 'NEMIKA',
  company_name text NOT NULL,
  address text,
  phone text,
  email text,
  website text,
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_name text NOT NULL,
  account_no text NOT NULL,
  account_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS ap_invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),




  vendor_name text NOT NULL,
  sp_po_date date NOT NULL,
  po_number text NOT NULL,
  product_name text,
  terms_name text,




  vendor_invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL,




  invoice_amount numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  outstanding_amount numeric(18,2) NOT NULL DEFAULT 0,
  overdue_amount numeric(18,2) NOT NULL DEFAULT 0,
  overdue_days integer NOT NULL DEFAULT 0,




  status record_status NOT NULL DEFAULT 'DRAFT',
  paid_date date NULL,
  notes text,




  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid NULL REFERENCES users(id),
  approved_at timestamptz NULL,
  rejected_reason text NULL,




  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);




CREATE UNIQUE INDEX IF NOT EXISTS ux_ap_vendor_invoice
ON ap_invoices(vendor_name, vendor_invoice_number);




CREATE INDEX IF NOT EXISTS ix_ap_status_due
ON ap_invoices(status, due_date);




CREATE TABLE IF NOT EXISTS ar_invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),




  sales_name text,
  sp_po_date date NOT NULL,
  order_number text NOT NULL,
  customer_name text NOT NULL,
  terms_name text,




  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL,




  invoice_amount numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  outstanding_amount numeric(18,2) NOT NULL DEFAULT 0,
  overdue_amount numeric(18,2) NOT NULL DEFAULT 0,
  overdue_days integer NOT NULL DEFAULT 0,




  status record_status NOT NULL DEFAULT 'DRAFT',
  paid_date date NULL,
  notes text,




  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid NULL REFERENCES users(id),
  approved_at timestamptz NULL,
  rejected_reason text NULL,




  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);




CREATE UNIQUE INDEX IF NOT EXISTS ux_ar_customer_invoice
ON ar_invoices(customer_name, invoice_number);




CREATE INDEX IF NOT EXISTS ix_ar_status_due
ON ar_invoices(status, due_date);




CREATE TABLE IF NOT EXISTS ap_payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_date date NOT NULL,
  bank_account_id uuid REFERENCES bank_accounts(id),
  reference_no text,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS ap_payment_allocations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id uuid NOT NULL REFERENCES ap_payments(id) ON DELETE CASCADE,
  ap_invoice_id uuid NOT NULL REFERENCES ap_invoices(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS ar_receipts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_date date NOT NULL,
  bank_account_id uuid REFERENCES bank_accounts(id),
  reference_no text,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS ar_receipt_allocations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id uuid NOT NULL REFERENCES ar_receipts(id) ON DELETE CASCADE,
  ar_invoice_id uuid NOT NULL REFERENCES ar_invoices(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS billing_letters (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ar_invoice_id uuid NOT NULL REFERENCES ar_invoices(id) ON DELETE CASCADE,
  letter_no text NOT NULL UNIQUE,
  letter_date date NOT NULL DEFAULT CURRENT_DATE,
  status record_status NOT NULL DEFAULT 'DRAFT',
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS billing_email_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ar_invoice_id uuid NOT NULL REFERENCES ar_invoices(id) ON DELETE CASCADE,
  billing_letter_id uuid REFERENCES billing_letters(id),
  to_email text NOT NULL,
  cc_email text,
  subject text NOT NULL,
  body_preview text,
  status email_status NOT NULL,
  error_message text,
  sent_by uuid NOT NULL REFERENCES users(id),
  sent_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  mime_type text,
  file_size bigint,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);




CREATE INDEX IF NOT EXISTS ix_attach_entity
ON attachments(entity_type, entity_id);




CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity text NOT NULL,
  file_name text NOT NULL,
  status text NOT NULL DEFAULT 'UPLOADED',
  total_rows integer NOT NULL DEFAULT 0,
  success_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS import_row_errors (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  column_name text,
  error_message text NOT NULL
);




CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_role user_role NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--- SQL DDL END ---




=====================================================
P) FINAL QUALITY BAR
=====================================================
Build this as a REAL internal enterprise finance system, not a demo.
No registration.
Only Super Admin can create users.
RBAC enforced in backend and UI.
UI labels and buttons are locked (must match exactly).
Excel templates must be strict with Indonesian headers and mapped to canonical keys.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://aparsystem.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/33a78b09-aa11-45a9-b298-7040a810eb4c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
