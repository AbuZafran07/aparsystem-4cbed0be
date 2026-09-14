import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
  ArrowUpDown, Upload, Download, FileSpreadsheet, CheckCircle, XCircle, AlertCircle,
  Loader2, RefreshCw, FileDown, Users, Building2, UserCircle, Clock, Landmark, BookOpen
} from 'lucide-react';
import {
  generateApTemplate, generateArTemplate, generateVendorTemplate, generateCustomerTemplate,
  generateSalesTemplate, generatePaymentTermsTemplate, generateBankAccountTemplate, generateChartOfAccountsTemplate,
  parseExcelFile, validateAndMapVendorData, validateAndMapCustomerData,
  validateAndMapSalesData, validateAndMapPaymentTermsData, validateAndMapBankAccountData, validateAndMapChartOfAccountsData,
} from '@/lib/importUtils';
import { exportToExcel, formatCurrencyForExport, formatDateForExport } from '@/lib/exportUtils';
import type { Database } from '@/integrations/supabase/types';

type ImportBatch = Database['public']['Tables']['import_batches']['Row'];
type MasterDataType = 'vendor' | 'customer' | 'sales' | 'payment_terms' | 'bank_account' | 'chart_of_accounts';

const MASTER_DATA_TABLE: Record<MasterDataType, string> = {
  vendor: 'vendors',
  customer: 'customers',
  sales: 'sales',
  payment_terms: 'payment_terms',
  bank_account: 'bank_accounts',
  chart_of_accounts: 'chart_of_accounts',
};

const statusColors: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
  partial: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  failed: 'bg-red-500/10 text-red-500 border-red-500/20',
  processing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

export default function ImportExportPage() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();

  const [importHistory, setImportHistory] = useState<ImportBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState<string | null>(null);
  const vendorFileRef = useRef<HTMLInputElement>(null);
  const customerFileRef = useRef<HTMLInputElement>(null);
  const salesFileRef = useRef<HTMLInputElement>(null);
  const paymentTermsFileRef = useRef<HTMLInputElement>(null);
  const bankAccountFileRef = useRef<HTMLInputElement>(null);
  const coaFileRef = useRef<HTMLInputElement>(null);
  const masterDataFileRefs: Record<MasterDataType, React.RefObject<HTMLInputElement>> = {
    vendor: vendorFileRef,
    customer: customerFileRef,
    sales: salesFileRef,
    payment_terms: paymentTermsFileRef,
    bank_account: bankAccountFileRef,
    chart_of_accounts: coaFileRef,
  };

  useEffect(() => {
    fetchImportHistory();
  }, []);

  const fetchImportHistory = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('import_batches')
        .select('*')
        .order('uploaded_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setImportHistory(data || []);
    } catch (error) {
      console.error('Error fetching import history:', error);
      toast({ title: 'Error', description: 'Failed to load import history', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd MMM yyyy, HH:mm', {
      locale: language === 'id' ? idLocale : undefined,
    });
  };

  // Records the batch in import_batches (+ import_row_errors on failed rows) so
  // the History tab reflects every master-data import, not just AP/AR.
  const logImportBatch = async (
    entity: string,
    fileName: string,
    totalRows: number,
    successRows: number,
    errors: { row: number; column?: string; message: string }[]
  ) => {
    if (!user) return;
    const status = errors.length === 0 ? 'completed' : successRows > 0 ? 'partial' : 'failed';
    const { data: batch, error: batchError } = await supabase
      .from('import_batches')
      .insert({
        entity,
        file_name: fileName,
        status,
        total_rows: totalRows,
        success_rows: successRows,
        failed_rows: errors.length,
        uploaded_by: user.id,
      })
      .select('id')
      .single();

    if (batchError || !batch) {
      console.error('Failed to log import batch:', batchError);
      return;
    }

    if (errors.length > 0) {
      await supabase.from('import_row_errors').insert(
        errors.map(err => ({
          batch_id: batch.id,
          row_number: err.row,
          column_name: err.column || null,
          error_message: err.message,
        }))
      );
    }
  };

  const handleImportMasterData = async (type: MasterDataType, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(type);
    try {
      const rows = await parseExcelFile(file);
      let result: { success: boolean; data: any[]; errors: { row: number; column?: string; message: string }[] };
      let insertedCount = 0;

      if (type === 'vendor') {
        result = validateAndMapVendorData(rows);
      } else if (type === 'customer') {
        result = validateAndMapCustomerData(rows);
      } else if (type === 'sales') {
        result = validateAndMapSalesData(rows);
      } else if (type === 'payment_terms') {
        result = validateAndMapPaymentTermsData(rows);
      } else if (type === 'bank_account') {
        const { data: glAccounts } = await supabase.from('chart_of_accounts').select('id, code');
        result = validateAndMapBankAccountData(rows, glAccounts || []);
      } else {
        const { data: existingAccounts } = await supabase.from('chart_of_accounts').select('id, code');
        result = validateAndMapChartOfAccountsData(rows, existingAccounts || []);
      }

      if (result.errors.length > 0) {
        toast({
          title: 'Error',
          description: result.errors.slice(0, 5).map(err => `Baris ${err.row}: ${err.message}`).join('\n')
            + (result.errors.length > 5 ? `\n... dan ${result.errors.length - 5} error lainnya` : ''),
          variant: 'destructive',
        });
      }

      if (result.data.length > 0) {
        if (type === 'chart_of_accounts') {
          // Insert sequentially so a row can reference a parent account code
          // created earlier in the same file (its id isn't known until inserted).
          const codeToId = new Map<string, string>();
          for (const row of result.data) {
            const { parent_code, ...insertRow } = row;
            const parentId = parent_code ? codeToId.get(parent_code) || null : null;
            if (parent_code && !parentId) {
              // Parent code refers to an existing account already fetched with its real id
              const existing = (await supabase.from('chart_of_accounts').select('id').eq('code', parent_code).maybeSingle()).data;
              if (existing) codeToId.set(parent_code, existing.id);
            }
            const { data: inserted, error } = await supabase
              .from('chart_of_accounts')
              .insert({ ...insertRow, parent_id: codeToId.get(parent_code) || null })
              .select('id')
              .single();
            if (error) throw error;
            codeToId.set(row.code, inserted.id);
            insertedCount++;
          }
        } else {
          const table = MASTER_DATA_TABLE[type];
          const { error } = await (supabase.from(table as any) as any).insert(result.data);
          if (error) throw error;
          insertedCount = result.data.length;
        }

        toast({
          title: language === 'en' ? 'Success' : 'Berhasil',
          description: `${insertedCount} ${type} ${language === 'en' ? 'imported successfully' : 'berhasil diimport'}`,
        });
      }

      await logImportBatch(type, file.name, rows.length - 1, insertedCount, result.errors);
      fetchImportHistory();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsImporting(null);
      const ref = masterDataFileRefs[type].current;
      if (ref) ref.value = '';
    }
  };

  const handleExport = async (type: 'ap' | 'ar') => {
    setIsExporting(type);
    try {
      if (type === 'ap') {
        const { data, error } = await supabase
          .from('ap_invoices')
          .select('*, vendors(vendor_name), payment_terms(terms_name)')
          .order('created_at', { ascending: false });
        if (error) throw error;
        const columns = [
          { key: 'vendors.vendor_name', header: 'Vendor', format: (v: any) => v?.vendor_name || '' },
          { key: 'vendor_invoice_number', header: 'Invoice No' },
          { key: 'po_number', header: 'PO Number' },
          { key: 'invoice_date', header: 'Invoice Date', format: formatDateForExport },
          { key: 'invoice_amount', header: 'Amount', format: formatCurrencyForExport },
          { key: 'status', header: 'Status' },
        ];
        const exportData = (data || []).map(d => ({ ...d, 'vendors.vendor_name': d.vendors }));
        exportToExcel(exportData, columns, `AP_Export_${format(new Date(), 'yyyyMMdd')}`);
      } else {
        const { data, error } = await supabase
          .from('ar_invoices')
          .select('*, customers(customer_name), sales(sales_name), payment_terms(terms_name)')
          .order('created_at', { ascending: false });
        if (error) throw error;
        const columns = [
          { key: 'customers.customer_name', header: 'Customer', format: (v: any) => v?.customer_name || '' },
          { key: 'invoice_number', header: 'Invoice No' },
          { key: 'invoice_date', header: 'Invoice Date', format: formatDateForExport },
          { key: 'invoice_amount', header: 'Amount', format: formatCurrencyForExport },
          { key: 'status', header: 'Status' },
        ];
        const exportData = (data || []).map(d => ({ ...d, 'customers.customer_name': d.customers }));
        exportToExcel(exportData, columns, `AR_Export_${format(new Date(), 'yyyyMMdd')}`);
      }
      toast({ title: t('common.success'), description: `${type.toUpperCase()} data exported successfully` });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'Error', description: 'Failed to export data', variant: 'destructive' });
    } finally {
      setIsExporting(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'partial': return <AlertCircle className="w-4 h-4 text-amber-500" />;
      default: return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ArrowUpDown className="w-6 h-6" />
            {t('menu.importExportCenter')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('importExport.description') || 'Import and export data for AP, AR, Vendor, and Customer'}
          </p>
        </div>
        <Button variant="outline" onClick={fetchImportHistory} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <Tabs defaultValue="import" className="space-y-6">
        <TabsList>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            {t('importExport.import') || 'Import'}
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            {t('importExport.export') || 'Export'}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            {t('importExport.history') || 'History'}
          </TabsTrigger>
        </TabsList>

        {/* Import Tab */}
        <TabsContent value="import" className="space-y-6">
          {/* Master Data Import */}
          <div>
            <h2 className="text-lg font-semibold mb-4 text-foreground">
              {language === 'en' ? 'Master Data Import' : 'Import Data Master'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Vendor Import */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    {language === 'en' ? 'Import Vendors' : 'Import Vendor'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'en' ? 'Upload Excel file to bulk import vendor data' : 'Upload file Excel untuk import data vendor secara massal'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input ref={vendorFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleImportMasterData('vendor', e)} />
                  <div 
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => vendorFileRef.current?.click()}
                  >
                    {isImporting === 'vendor' ? (
                      <Loader2 className="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
                    ) : (
                      <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    )}
                    <p className="text-sm text-muted-foreground mb-2">
                      {language === 'en' ? 'Click to select Excel file' : 'Klik untuk pilih file Excel'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {language === 'en' ? 'Columns: Nama Vendor, Alamat, Telepon, Email, Nama Bank, No Rekening' : 'Kolom: Nama Vendor, Alamat, Telepon, Email, Nama Bank, No Rekening'}
                    </p>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button variant="link" size="sm" onClick={() => generateVendorTemplate()}>
                      <FileDown className="w-4 h-4 mr-1" />
                      {t('importExport.downloadTemplate') || 'Download Template'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Customer Import */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    {language === 'en' ? 'Import Customers' : 'Import Customer'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'en' ? 'Upload Excel file to bulk import customer data' : 'Upload file Excel untuk import data customer secara massal'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input ref={customerFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleImportMasterData('customer', e)} />
                  <div 
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => customerFileRef.current?.click()}
                  >
                    {isImporting === 'customer' ? (
                      <Loader2 className="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
                    ) : (
                      <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    )}
                    <p className="text-sm text-muted-foreground mb-2">
                      {language === 'en' ? 'Click to select Excel file' : 'Klik untuk pilih file Excel'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {language === 'en' ? 'Columns: Nama Customer, Alamat, Telepon, Email Penagihan' : 'Kolom: Nama Customer, Alamat, Telepon, Email Penagihan'}
                    </p>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button variant="link" size="sm" onClick={() => generateCustomerTemplate()}>
                      <FileDown className="w-4 h-4 mr-1" />
                      {t('importExport.downloadTemplate') || 'Download Template'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Sales Import */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserCircle className="w-5 h-5" />
                    {language === 'en' ? 'Import Sales' : 'Import Sales'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'en' ? 'Upload Excel file to bulk import sales rep data' : 'Upload file Excel untuk import data sales secara massal'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input ref={salesFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleImportMasterData('sales', e)} />
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => salesFileRef.current?.click()}
                  >
                    {isImporting === 'sales' ? (
                      <Loader2 className="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
                    ) : (
                      <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    )}
                    <p className="text-sm text-muted-foreground mb-2">
                      {language === 'en' ? 'Click to select Excel file' : 'Klik untuk pilih file Excel'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {language === 'en' ? 'Columns: Nama Sales, Telepon, Email' : 'Kolom: Nama Sales, Telepon, Email'}
                    </p>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button variant="link" size="sm" onClick={() => generateSalesTemplate()}>
                      <FileDown className="w-4 h-4 mr-1" />
                      {t('importExport.downloadTemplate') || 'Download Template'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Terms Import */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    {language === 'en' ? 'Import Payment Terms' : 'Import Termin Pembayaran'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'en' ? 'Upload Excel file to bulk import payment terms' : 'Upload file Excel untuk import termin pembayaran secara massal'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input ref={paymentTermsFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleImportMasterData('payment_terms', e)} />
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => paymentTermsFileRef.current?.click()}
                  >
                    {isImporting === 'payment_terms' ? (
                      <Loader2 className="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
                    ) : (
                      <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    )}
                    <p className="text-sm text-muted-foreground mb-2">
                      {language === 'en' ? 'Click to select Excel file' : 'Klik untuk pilih file Excel'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {language === 'en' ? 'Columns: Nama Termin, Jumlah Hari' : 'Kolom: Nama Termin, Jumlah Hari'}
                    </p>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button variant="link" size="sm" onClick={() => generatePaymentTermsTemplate()}>
                      <FileDown className="w-4 h-4 mr-1" />
                      {t('importExport.downloadTemplate') || 'Download Template'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Bank Accounts Import */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Landmark className="w-5 h-5" />
                    {language === 'en' ? 'Import Bank Accounts' : 'Import Rekening Bank'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'en' ? 'Upload Excel file to bulk import bank accounts' : 'Upload file Excel untuk import rekening bank secara massal'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input ref={bankAccountFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleImportMasterData('bank_account', e)} />
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => bankAccountFileRef.current?.click()}
                  >
                    {isImporting === 'bank_account' ? (
                      <Loader2 className="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
                    ) : (
                      <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    )}
                    <p className="text-sm text-muted-foreground mb-2">
                      {language === 'en' ? 'Click to select Excel file' : 'Klik untuk pilih file Excel'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {language === 'en' ? 'Columns: Nama Bank, No Rekening, Nama Pemilik Rekening, Kode Akun GL (optional)' : 'Kolom: Nama Bank, No Rekening, Nama Pemilik Rekening, Kode Akun GL (opsional)'}
                    </p>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button variant="link" size="sm" onClick={() => generateBankAccountTemplate()}>
                      <FileDown className="w-4 h-4 mr-1" />
                      {t('importExport.downloadTemplate') || 'Download Template'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Chart of Accounts Import */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5" />
                    {language === 'en' ? 'Import Chart of Accounts' : 'Import Bagan Akun'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'en' ? 'Upload Excel file to bulk import GL accounts' : 'Upload file Excel untuk import akun GL secara massal'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input ref={coaFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleImportMasterData('chart_of_accounts', e)} />
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => coaFileRef.current?.click()}
                  >
                    {isImporting === 'chart_of_accounts' ? (
                      <Loader2 className="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
                    ) : (
                      <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    )}
                    <p className="text-sm text-muted-foreground mb-2">
                      {language === 'en' ? 'Click to select Excel file' : 'Klik untuk pilih file Excel'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {language === 'en'
                        ? 'Columns: Kode Akun, Nama Akun, Tipe Akun, Saldo Normal, Kode Akun Induk, Akun Kontrol'
                        : 'Kolom: Kode Akun, Nama Akun, Tipe Akun, Saldo Normal, Kode Akun Induk, Akun Kontrol'}
                    </p>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button variant="link" size="sm" onClick={() => generateChartOfAccountsTemplate()}>
                      <FileDown className="w-4 h-4 mr-1" />
                      {t('importExport.downloadTemplate') || 'Download Template'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Invoice Import */}
          <div>
            <h2 className="text-lg font-semibold mb-4 text-foreground">
              {language === 'en' ? 'Invoice Import' : 'Import Invoice'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* AP Import */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('importExport.importAp') || 'Import AP Invoices'}</CardTitle>
                  <CardDescription>
                    {t('importExport.importApDesc') || 'Upload Excel file to import AP invoice data'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                    <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('importExport.dragDrop') || 'Drag and drop your Excel file here, or click to browse'}
                    </p>
                    <Button variant="outline">
                      <Upload className="w-4 h-4 mr-2" />
                      {t('importExport.selectFile') || 'Select File'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {t('importExport.templateNote') || 'Download template for correct format'}
                    </p>
                    <Button variant="link" size="sm" onClick={() => generateApTemplate()}>
                      <FileDown className="w-4 h-4 mr-1" />
                      {t('importExport.downloadTemplate') || 'Download Template'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* AR Import */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('importExport.importAr') || 'Import AR Invoices'}</CardTitle>
                  <CardDescription>
                    {t('importExport.importArDesc') || 'Upload Excel file to import AR invoice data'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                    <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('importExport.dragDrop') || 'Drag and drop your Excel file here, or click to browse'}
                    </p>
                    <Button variant="outline">
                      <Upload className="w-4 h-4 mr-2" />
                      {t('importExport.selectFile') || 'Select File'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {t('importExport.templateNote') || 'Download template for correct format'}
                    </p>
                    <Button variant="link" size="sm" onClick={() => generateArTemplate()}>
                      <FileDown className="w-4 h-4 mr-1" />
                      {t('importExport.downloadTemplate') || 'Download Template'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('importExport.exportAp') || 'Export AP Data'}</CardTitle>
                <CardDescription>{t('importExport.exportApDesc') || 'Download all AP invoice data as Excel file'}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => handleExport('ap')} disabled={isExporting === 'ap'} className="w-full">
                  {isExporting === 'ap' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  {t('importExport.exportToExcel') || 'Export to Excel'}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('importExport.exportAr') || 'Export AR Data'}</CardTitle>
                <CardDescription>{t('importExport.exportArDesc') || 'Download all AR invoice data as Excel file'}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => handleExport('ar')} disabled={isExporting === 'ar'} className="w-full">
                  {isExporting === 'ar' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  {t('importExport.exportToExcel') || 'Export to Excel'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t('importExport.importHistory') || 'Import History'}</span>
                <Badge variant="secondary">{importHistory.length} records</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : importHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('importExport.noHistory') || 'No import history found'}</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('importExport.fileName') || 'File Name'}</TableHead>
                        <TableHead>{t('importExport.entity') || 'Entity'}</TableHead>
                        <TableHead>{t('importExport.status') || 'Status'}</TableHead>
                        <TableHead className="text-right">{t('importExport.total') || 'Total'}</TableHead>
                        <TableHead className="text-right">{t('importExport.success') || 'Success'}</TableHead>
                        <TableHead className="text-right">{t('importExport.failed') || 'Failed'}</TableHead>
                        <TableHead>{t('importExport.uploadedAt') || 'Uploaded At'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importHistory.map((batch) => (
                        <TableRow key={batch.id}>
                          <TableCell className="font-medium">{batch.file_name}</TableCell>
                          <TableCell><Badge variant="outline">{batch.entity}</Badge></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(batch.status)}
                              <Badge variant="outline" className={statusColors[batch.status] || ''}>{batch.status}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{batch.total_rows}</TableCell>
                          <TableCell className="text-right text-green-500">{batch.success_rows}</TableCell>
                          <TableCell className="text-right text-red-500">{batch.failed_rows}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(batch.uploaded_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}