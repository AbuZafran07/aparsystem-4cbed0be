import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type Language = 'en' | 'id';

interface TranslationMap {
  [key: string]: {
    en: string;
    id: string;
  };
}

// All locked UI labels and buttons - EXACT as specified
const translations: TranslationMap = {
  // Section Headers
  'section.overview': { en: 'OVERVIEW', id: 'RINGKASAN' },
  'section.transactions': { en: 'TRANSACTIONS', id: 'TRANSAKSI' },
  'section.billing': { en: 'BILLING', id: 'PENAGIHAN' },
  'section.masterData': { en: 'MASTER DATA', id: 'MASTER DATA' },
  'section.reports': { en: 'REPORTS', id: 'LAPORAN' },
  'section.system': { en: 'SYSTEM', id: 'SISTEM' },

  // Menu Items
  'menu.dashboard': { en: 'Dashboard', id: 'Dashboard' },
  'menu.accountsPayable': { en: 'Accounts Payable (AP)', id: 'Hutang Vendor (AP)' },
  'menu.accountsReceivable': { en: 'Accounts Receivable (AR)', id: 'Piutang Customer (AR)' },
  'menu.apPayments': { en: 'AP Payments', id: 'Pembayaran AP' },
  'menu.arReceipts': { en: 'AR Receipts', id: 'Penerimaan AR' },
  'menu.billingLetters': { en: 'Billing Letters', id: 'Surat Tagihan' },
  'menu.billingEmailLogs': { en: 'Billing Email Logs', id: 'Log Email Tagihan' },
  'menu.vendors': { en: 'Vendors', id: 'Vendor' },
  'menu.customers': { en: 'Customers', id: 'Customer' },
  'menu.sales': { en: 'Sales', id: 'Sales' },
  'menu.paymentTerms': { en: 'Payment Terms', id: 'Termin Pembayaran' },
  'menu.bankAccounts': { en: 'Bank Accounts', id: 'Rekening Bank' },
  'menu.companyProfile': { en: 'Company Profile', id: 'Profil Perusahaan' },
  'menu.apAging': { en: 'AP Aging', id: 'Aging AP' },
  'menu.arAging': { en: 'AR Aging', id: 'Aging AR' },
  'menu.apReport': { en: 'AP Report', id: 'Laporan AP' },
  'menu.arReport': { en: 'AR Report', id: 'Laporan AR' },
  'menu.cashflow': { en: 'Cashflow', id: 'Arus Kas' },
  'menu.customerStatus': { en: 'Customer Status', id: 'Status Customer' },
  'menu.paymentRequests': { en: 'Payment Requests', id: 'Pengajuan Pembayaran' },
  'menu.paymentRequestsAp': { en: 'AP Payment Requests', id: 'Pengajuan Pembayaran AP' },
  'menu.exportCenter': { en: 'Export Center', id: 'Pusat Ekspor' },
  'menu.importExportCenter': { en: 'Import/Export Center', id: 'Pusat Impor/Ekspor' },
  'menu.auditLogs': { en: 'Audit Logs', id: 'Log Audit' },
  'menu.userManagement': { en: 'User Management', id: 'Manajemen User' },
  'menu.systemSettings': { en: 'System Settings', id: 'Pengaturan Sistem' },
  'menu.backupRestore': { en: 'Backup & Restore', id: 'Backup & Restore' },

  // Common Buttons
  'btn.save': { en: 'Save', id: 'Simpan' },
  'btn.cancel': { en: 'Cancel', id: 'Batal' },
  'btn.close': { en: 'Close', id: 'Tutup' },
  'btn.back': { en: 'Back', id: 'Kembali' },
  'btn.submit': { en: 'Submit', id: 'Ajukan' },
  'btn.approve': { en: 'Approve', id: 'Setujui' },
  'btn.reject': { en: 'Reject', id: 'Tolak' },
  'btn.view': { en: 'View', id: 'Lihat' },
  'btn.edit': { en: 'Edit', id: 'Ubah' },
  'btn.delete': { en: 'Delete', id: 'Hapus' },
  'btn.download': { en: 'Download', id: 'Unduh' },
  'btn.upload': { en: 'Upload', id: 'Unggah' },
  'btn.export': { en: 'Export', id: 'Ekspor' },
  'btn.import': { en: 'Import', id: 'Impor' },
  'btn.preview': { en: 'Preview', id: 'Pratinjau' },
  'btn.confirm': { en: 'Confirm', id: 'Konfirmasi' },
  'btn.logout': { en: 'Logout', id: 'Keluar' },
  'btn.signIn': { en: 'Sign In', id: 'Masuk' },

  // AP Action Buttons
  'btn.newApInvoice': { en: 'New AP Invoice', id: 'AP Baru' },
  'btn.recordPayment': { en: 'Record Payment', id: 'Catat Pembayaran' },

  // AR Action Buttons
  'btn.newArInvoice': { en: 'New AR Invoice', id: 'AR Baru' },
  'btn.recordReceipt': { en: 'Record Receipt', id: 'Catat Penerimaan' },
  'btn.generateBillingLetter': { en: 'Generate Billing Letter', id: 'Buat Surat Tagihan' },
  'btn.sendBillingEmail': { en: 'Send Billing Email', id: 'Kirim Email Tagihan' },

  // Login Text
  'login.title': { en: 'Sign In to Your Account', id: 'Masuk ke Akun' },
  'login.subtitle': { en: 'Use the email and password provided by the administrator', id: 'Gunakan email dan password yang diberikan administrator' },
  'login.noAccount': { en: "Don't have an account? Please contact the Super Admin to create a new account.", id: 'Tidak memiliki akun? Hubungi Super Admin untuk pembuatan akun baru.' },
  'login.email': { en: 'Email', id: 'Email' },
  'login.password': { en: 'Password', id: 'Password' },
  'login.emailPlaceholder': { en: 'nama@kemika.co.id', id: 'nama@kemika.co.id' },
  'login.passwordPlaceholder': { en: 'Enter your password', id: 'Masukkan password' },

  // Hero Section
  'hero.title': { en: 'Enterprise AP/AR System', id: 'Enterprise AP/AR System' },
  'hero.subtitle': { en: 'Manage vendor payables, customer receivables, billing letters, approvals, and reports in one integrated platform.', id: 'Kelola hutang vendor, piutang customer, surat tagihan, approval, dan laporan dalam satu platform terintegrasi.' },
  'hero.stat1': { en: '4 Roles', id: '4 Role' },
  'hero.stat2': { en: '100% Paperless', id: '100% Paperless' },
  'hero.stat3': { en: 'Real-time Tracking', id: 'Real-time Tracking' },

  // Dashboard KPIs
  'kpi.totalApOutstanding': { en: 'Total AP Outstanding', id: 'Total AP Outstanding' },
  'kpi.totalArOutstanding': { en: 'Total AR Outstanding', id: 'Total AR Outstanding' },
  'kpi.apOverdue': { en: 'AP Overdue', id: 'AP Jatuh Tempo' },
  'kpi.arOverdue': { en: 'AR Overdue', id: 'AR Jatuh Tempo' },
  'kpi.apDraft': { en: 'AP Draft', id: 'AP Draft' },
  'kpi.apSubmitted': { en: 'AP Submitted', id: 'AP Diajukan' },

  // Table Headers
  'table.vendorName': { en: 'Vendor Name', id: 'Nama Vendor' },
  'table.customerName': { en: 'Customer Name', id: 'Nama Customer' },
  'table.invoiceNumber': { en: 'Invoice Number', id: 'No. Invoice' },
  'table.invoiceDate': { en: 'Invoice Date', id: 'Tanggal Invoice' },
  'table.dueDate': { en: 'Due Date', id: 'Jatuh Tempo' },
  'table.invoiceAmount': { en: 'Invoice Amount', id: 'Nilai Invoice' },
  'table.outstanding': { en: 'Outstanding', id: 'Outstanding' },
  'table.overdueDays': { en: 'Overdue Days', id: 'Hari Jatuh Tempo' },
  'table.status': { en: 'Status', id: 'Status' },
  'table.actions': { en: 'Actions', id: 'Aksi' },

  // Status Labels
  'status.draft': { en: 'Draft', id: 'Draft' },
  'status.submitted': { en: 'Submitted', id: 'Diajukan' },
  'status.approved': { en: 'Approved', id: 'Disetujui' },
  'status.rejected': { en: 'Rejected', id: 'Ditolak' },
  'status.partial': { en: 'Partial', id: 'Sebagian' },
  'status.paid': { en: 'Paid', id: 'Lunas' },

  // Common
  'common.search': { en: 'Search...', id: 'Cari...' },
  'common.filter': { en: 'Filter', id: 'Filter' },
  'common.noData': { en: 'No data available', id: 'Tidak ada data' },
  'common.loading': { en: 'Loading...', id: 'Memuat...' },
  'common.error': { en: 'Error', id: 'Error' },
  'common.success': { en: 'Success', id: 'Berhasil' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('id'); // Default: Indonesian

  const t = useCallback((key: string): string => {
    const translation = translations[key];
    if (!translation) {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }
    return translation[language];
  }, [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage(prev => prev === 'en' ? 'id' : 'en');
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
