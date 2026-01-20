import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { 
  ArrowUpDown, 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  RefreshCw,
  FileDown
} from 'lucide-react';
import { generateApTemplate, generateArTemplate } from '@/lib/importUtils';
import { exportToExcel, formatCurrencyForExport, formatDateForExport } from '@/lib/exportUtils';
import type { Database } from '@/integrations/supabase/types';

type ImportBatch = Database['public']['Tables']['import_batches']['Row'];

const statusColors: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
  partial: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  failed: 'bg-red-500/10 text-red-500 border-red-500/20',
  processing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

export default function ImportExportPage() {
  const { t, language } = useLanguage();
  const { toast } = useToast();

  const [importHistory, setImportHistory] = useState<ImportBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState<string | null>(null);

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
      toast({
        title: 'Error',
        description: 'Failed to load import history',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd MMM yyyy, HH:mm', {
      locale: language === 'id' ? idLocale : undefined,
    });
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

      toast({
        title: t('common.success'),
        description: `${type.toUpperCase()} data exported successfully`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Error',
        description: 'Failed to export data',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'partial':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      default:
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ArrowUpDown className="w-6 h-6" />
            {t('menu.importExportCenter')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('importExport.description') || 'Import and export data for AP and AR modules'}
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
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AP Export */}
            <Card>
              <CardHeader>
                <CardTitle>{t('importExport.exportAp') || 'Export AP Data'}</CardTitle>
                <CardDescription>
                  {t('importExport.exportApDesc') || 'Download all AP invoice data as Excel file'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => handleExport('ap')} 
                  disabled={isExporting === 'ap'}
                  className="w-full"
                >
                  {isExporting === 'ap' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {t('importExport.exportToExcel') || 'Export to Excel'}
                </Button>
              </CardContent>
            </Card>

            {/* AR Export */}
            <Card>
              <CardHeader>
                <CardTitle>{t('importExport.exportAr') || 'Export AR Data'}</CardTitle>
                <CardDescription>
                  {t('importExport.exportArDesc') || 'Download all AR invoice data as Excel file'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => handleExport('ar')} 
                  disabled={isExporting === 'ar'}
                  className="w-full"
                >
                  {isExporting === 'ar' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
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
                          <TableCell>
                            <Badge variant="outline">{batch.entity}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(batch.status)}
                              <Badge variant="outline" className={statusColors[batch.status] || ''}>
                                {batch.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{batch.total_rows}</TableCell>
                          <TableCell className="text-right text-green-500">{batch.success_rows}</TableCell>
                          <TableCell className="text-right text-red-500">{batch.failed_rows}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(batch.uploaded_at)}
                          </TableCell>
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
