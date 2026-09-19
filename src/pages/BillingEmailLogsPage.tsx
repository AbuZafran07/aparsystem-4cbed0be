import React, { useState, useEffect } from 'react';
import { Search, Eye, Mail, CheckCircle, XCircle, Loader2, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { TablePagination, usePagination } from '@/components/TablePagination';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type EmailStatus = Database['public']['Enums']['email_status'];

interface EmailLog {
  id: string;
  ar_invoice_id: string;
  billing_letter_id: string | null;
  invoice_number: string;
  customer_name: string;
  to_email: string;
  cc_email: string | null;
  subject: string;
  body_preview: string | null;
  status: EmailStatus;
  error_message: string | null;
  sent_at: string;
  sent_by: string;
  sender_name: string | null;
}

const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function BillingEmailLogsPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch email logs with invoice and sender data
      const { data: logsData, error: logsError } = await supabase
        .from('billing_email_logs')
        .select(`
          *,
          ar_invoices (
            invoice_number,
            customers (
              customer_name
            )
          ),
          profiles:sent_by (
            full_name
          )
        `)
        .order('sent_at', { ascending: false });

      if (logsError) throw logsError;

      const formattedLogs: EmailLog[] = (logsData || []).map((log: any) => ({
        id: log.id,
        ar_invoice_id: log.ar_invoice_id,
        billing_letter_id: log.billing_letter_id,
        invoice_number: log.ar_invoices?.invoice_number || '',
        customer_name: log.ar_invoices?.customers?.customer_name || 'Unknown',
        to_email: log.to_email,
        cc_email: log.cc_email,
        subject: log.subject,
        body_preview: log.body_preview,
        status: log.status,
        error_message: log.error_message,
        sent_at: log.sent_at,
        sent_by: log.sent_by,
        sender_name: log.profiles?.full_name || null,
      }));

      setLogs(formattedLogs);

    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error(language === 'en' ? 'Failed to load data' : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const handleView = (log: EmailLog) => {
    setSelectedLog(log);
    setIsViewDialogOpen(true);
  };

  const filteredLogs = logs.filter(
    (log) =>
      log.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.to_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const {
    paginatedItems: paginatedLogs,
    currentPage,
    pageSize,
    totalItems,
    handlePageChange,
    handlePageSizeChange,
  } = usePagination(filteredLogs, 25);

  const successCount = logs.filter(l => l.status === 'SENT').length;
  const failedCount = logs.filter(l => l.status === 'FAILED').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('menu.billingEmailLogs')}</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'View billing email delivery logs' : 'Lihat log pengiriman email tagihan'}
          </p>
        </div>
        
        {/* Stats */}
        <div className="flex gap-4">
          <div className="flex items-center gap-2 bg-chart-2/10 px-4 py-2 rounded-lg">
            <CheckCircle className="h-5 w-5 text-chart-2" />
            <div>
              <p className="text-xs text-muted-foreground">{language === 'en' ? 'Sent' : 'Terkirim'}</p>
              <p className="text-lg font-bold text-chart-2">{successCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-destructive/10 px-4 py-2 rounded-lg">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">{language === 'en' ? 'Failed' : 'Gagal'}</p>
              <p className="text-lg font-bold text-destructive">{failedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('common.search')}
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Sent At' : 'Waktu Kirim'}</TableHead>
                <TableHead>{t('table.invoiceNumber')}</TableHead>
                <TableHead>{t('table.customerName')}</TableHead>
                <TableHead>{language === 'en' ? 'To Email' : 'Email Tujuan'}</TableHead>
                <TableHead>{language === 'en' ? 'Subject' : 'Subjek'}</TableHead>
                <TableHead className="text-center">{t('table.status')}</TableHead>
                <TableHead>{language === 'en' ? 'Sent By' : 'Dikirim Oleh'}</TableHead>
                <TableHead className="text-center">{t('table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {formatDateTime(log.sent_at)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{log.invoice_number}</TableCell>
                    <TableCell>{log.customer_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate max-w-[200px]">{log.to_email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="truncate max-w-[200px] block">{log.subject}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {log.status === 'SENT' ? (
                        <Badge className="bg-chart-2 hover:bg-chart-2/80">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {language === 'en' ? 'Sent' : 'Terkirim'}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />
                          {language === 'en' ? 'Failed' : 'Gagal'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{log.sender_name || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleView(log)}
                          title={t('btn.view')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {language === 'en' ? 'Email Log Details' : 'Detail Log Email'}
            </DialogTitle>
            <DialogDescription>
              {selectedLog?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Sent At' : 'Waktu Kirim'}</p>
                  <p className="font-medium">{formatDateTime(selectedLog.sent_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('table.status')}</p>
                  <p className="font-medium">
                    {selectedLog.status === 'SENT' ? (
                      <span className="text-chart-2">{language === 'en' ? 'Sent' : 'Terkirim'}</span>
                    ) : (
                      <span className="text-destructive">{language === 'en' ? 'Failed' : 'Gagal'}</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('table.invoiceNumber')}</p>
                  <p className="font-medium">{selectedLog.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('table.customerName')}</p>
                  <p className="font-medium">{selectedLog.customer_name}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'To Email' : 'Email Tujuan'}</p>
                  <p className="font-medium">{selectedLog.to_email}</p>
                </div>
                {selectedLog.cc_email && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">CC</p>
                    <p className="font-medium">{selectedLog.cc_email}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Subject' : 'Subjek'}</p>
                  <p className="font-medium">{selectedLog.subject}</p>
                </div>
                {selectedLog.body_preview && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">{language === 'en' ? 'Preview' : 'Pratinjau'}</p>
                    <p className="font-medium text-sm bg-muted p-3 rounded-lg">{selectedLog.body_preview}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Sent By' : 'Dikirim Oleh'}</p>
                  <p className="font-medium">{selectedLog.sender_name || '-'}</p>
                </div>
              </div>
              
              {selectedLog.error_message && (
                <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                  <p className="text-sm font-medium text-destructive">{language === 'en' ? 'Error Message' : 'Pesan Error'}</p>
                  <p className="text-sm text-destructive/80 mt-1">{selectedLog.error_message}</p>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  {t('btn.close')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
