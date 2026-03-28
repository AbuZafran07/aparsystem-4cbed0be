import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, AlertTriangle, Clock, CheckCircle2, Users, RefreshCw, FileText, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { TablePagination, usePagination } from '@/components/TablePagination';

interface CustomerInvoice {
  id: string;
  invoice_number: string;
  order_number: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  overdue_days: number;
  status: string;
}

interface CustomerSummary {
  id: string;
  customer_name: string;
  billing_email: string | null;
  phone: string | null;
  totalInvoices: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueInvoices: CustomerInvoice[];
  outstandingInvoices: CustomerInvoice[];
  paidInvoices: CustomerInvoice[];
  maxOverdueDays: number;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

export default function CustomerStatusPage() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('overdue');
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: customerData }, { data: invoiceData }] = await Promise.all([
        supabase.from('customers').select('*').eq('is_active', true).order('customer_name'),
        supabase.from('ar_invoices').select('*').in('status', ['APPROVED', 'PARTIAL', 'PAID']),
      ]);

      if (!customerData || !invoiceData) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const summaries: CustomerSummary[] = customerData.map((cust) => {
        const custInvoices = invoiceData.filter((inv: any) => inv.customer_id === cust.id);

        const overdueInvoices: CustomerInvoice[] = [];
        const outstandingInvoices: CustomerInvoice[] = [];
        const paidInvoices: CustomerInvoice[] = [];

        custInvoices.forEach((inv: any) => {
          const dueDate = new Date(inv.due_date);
          dueDate.setHours(0, 0, 0, 0);
          const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
          const realOverdueDays = diffDays > 0 ? diffDays : 0;

          const mapped: CustomerInvoice = {
            id: inv.id,
            invoice_number: inv.invoice_number,
            order_number: inv.order_number,
            invoice_date: inv.invoice_date,
            due_date: inv.due_date,
            invoice_amount: inv.invoice_amount,
            paid_amount: inv.paid_amount,
            outstanding_amount: inv.outstanding_amount,
            overdue_days: realOverdueDays,
            status: inv.status,
          };

          if (inv.status === 'PAID') {
            paidInvoices.push(mapped);
          } else if (realOverdueDays > 0 && inv.outstanding_amount > 0) {
            overdueInvoices.push(mapped);
          } else if (inv.outstanding_amount > 0) {
            outstandingInvoices.push(mapped);
          } else {
            paidInvoices.push(mapped);
          }
        });

        return {
          id: cust.id,
          customer_name: cust.customer_name,
          billing_email: cust.billing_email,
          phone: cust.phone,
          totalInvoices: custInvoices.length,
          totalAmount: custInvoices.reduce((s: number, i: any) => s + Number(i.invoice_amount), 0),
          totalPaid: custInvoices.reduce((s: number, i: any) => s + Number(i.paid_amount), 0),
          totalOutstanding: custInvoices.reduce((s: number, i: any) => s + Number(i.outstanding_amount), 0),
          overdueInvoices: overdueInvoices.sort((a, b) => b.overdue_days - a.overdue_days),
          outstandingInvoices: outstandingInvoices.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()),
          paidInvoices: paidInvoices.sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()),
          maxOverdueDays: Math.max(0, ...overdueInvoices.map(i => i.overdue_days)),
        };
      });

      setCustomers(summaries);
    } catch (err) {
      console.error('Error fetching customer status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleCustomer = (id: string) => {
    setExpandedCustomers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredCustomers = customers.filter(c =>
    c.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const overdueCustomers = filteredCustomers.filter(c => c.overdueInvoices.length > 0).sort((a, b) => b.maxOverdueDays - a.maxOverdueDays);
  const outstandingCustomers = filteredCustomers.filter(c => c.outstandingInvoices.length > 0).sort((a, b) => {
    const aTotal = a.outstandingInvoices.reduce((s, i) => s + i.outstanding_amount, 0);
    const bTotal = b.outstandingInvoices.reduce((s, i) => s + i.outstanding_amount, 0);
    return bTotal - aTotal;
  });
  const paidCustomers = filteredCustomers.filter(c => c.paidInvoices.length > 0 && c.overdueInvoices.length === 0 && c.outstandingInvoices.length === 0);

  const totalOverdueAmount = overdueCustomers.reduce((s, c) => s + c.overdueInvoices.reduce((ss, i) => ss + i.outstanding_amount, 0), 0);
  const totalOutstandingAmount = outstandingCustomers.reduce((s, c) => s + c.outstandingInvoices.reduce((ss, i) => ss + i.outstanding_amount, 0), 0);
  const totalPaidAmount = paidCustomers.reduce((s, c) => s + c.paidInvoices.reduce((ss, i) => ss + i.invoice_amount, 0), 0);

  const t = (en: string, id: string) => language === 'en' ? en : id;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderCustomerCard = (customer: CustomerSummary, invoices: CustomerInvoice[], type: 'overdue' | 'outstanding' | 'paid') => {
    const isExpanded = expandedCustomers[`${customer.id}-${type}`];
    const displayInvoices = isExpanded ? invoices : invoices.slice(0, 3);
    const totalAmount = invoices.reduce((s, i) => s + (type === 'paid' ? i.invoice_amount : i.outstanding_amount), 0);

    return (
      <Card key={`${customer.id}-${type}`} className="overflow-hidden">
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => toggleCustomer(`${customer.id}-${type}`)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              type === 'overdue' ? 'bg-destructive/10 text-destructive' :
              type === 'outstanding' ? 'bg-amber-500/10 text-amber-600' :
              'bg-emerald-500/10 text-emerald-600'
            }`}>
              {type === 'overdue' ? <AlertTriangle className="h-5 w-5" /> :
               type === 'outstanding' ? <Clock className="h-5 w-5" /> :
               <CheckCircle2 className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{customer.customer_name}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{invoices.length} invoice{invoices.length > 1 ? 's' : ''}</span>
                {customer.billing_email && <span>• {customer.billing_email}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className={`font-bold text-sm ${
                type === 'overdue' ? 'text-destructive' :
                type === 'outstanding' ? 'text-amber-600' :
                'text-emerald-600'
              }`}>
                {formatCurrency(totalAmount)}
              </p>
              {type === 'overdue' && customer.maxOverdueDays > 0 && (
                <p className="text-xs text-destructive">
                  {t('Max', 'Maks')} {customer.maxOverdueDays} {t('days', 'hari')}
                </p>
              )}
            </div>
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {isExpanded && (
          <>
            <Separator />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t('Invoice #', 'No. Invoice')}</TableHead>
                    <TableHead className="text-xs">{t('Invoice Date', 'Tgl Invoice')}</TableHead>
                    <TableHead className="text-xs">{t('Due Date', 'Jatuh Tempo')}</TableHead>
                    <TableHead className="text-xs text-right">{t('Amount', 'Jumlah')}</TableHead>
                    {type !== 'paid' && <TableHead className="text-xs text-right">{t('Outstanding', 'Sisa')}</TableHead>}
                    {type === 'overdue' && <TableHead className="text-xs text-right">{t('Overdue', 'Terlambat')}</TableHead>}
                    <TableHead className="text-xs">{t('Status', 'Status')}</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayInvoices.map(inv => (
                    <TableRow key={inv.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs font-medium">{inv.invoice_number}</TableCell>
                      <TableCell className="text-xs">{formatDate(inv.invoice_date)}</TableCell>
                      <TableCell className="text-xs">{formatDate(inv.due_date)}</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(inv.invoice_amount)}</TableCell>
                      {type !== 'paid' && (
                        <TableCell className="text-xs text-right font-medium">{formatCurrency(inv.outstanding_amount)}</TableCell>
                      )}
                      {type === 'overdue' && (
                        <TableCell className="text-xs text-right">
                          <Badge variant="destructive" className="text-[10px]">{inv.overdue_days} {t('days', 'hari')}</Badge>
                        </TableCell>
                      )}
                      <TableCell className="text-xs">
                        <Badge variant={inv.status === 'PAID' ? 'default' : inv.status === 'PARTIAL' ? 'secondary' : 'outline'} className="text-[10px]">
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigate(`/ar/${inv.id}`)}>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {invoices.length > 3 && !isExpanded && null}
            {invoices.length > 3 && (
              <div className="px-4 pb-3">
                {!isExpanded ? null : displayInvoices.length < invoices.length ? (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={(e) => { e.stopPropagation(); }}>
                    {t(`Showing ${displayInvoices.length} of ${invoices.length}`, `Menampilkan ${displayInvoices.length} dari ${invoices.length}`)}
                  </Button>
                ) : null}
              </div>
            )}
          </>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('Customer Status', 'Status Customer')}</h1>
          <p className="text-sm text-muted-foreground">{t('Overview of customer payment status', 'Ringkasan status pembayaran customer')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('Refresh', 'Perbarui')}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-destructive/30 bg-destructive/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('overdue')}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('Overdue', 'Jatuh Tempo Lewat')}</p>
                <p className="text-lg font-bold text-destructive">{overdueCustomers.length} {t('customers', 'customer')}</p>
                <p className="text-xs text-destructive/80">{formatCurrency(totalOverdueAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/30 bg-amber-500/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('outstanding')}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('Outstanding', 'Belum Lunas')}</p>
                <p className="text-lg font-bold text-amber-600">{outstandingCustomers.length} {t('customers', 'customer')}</p>
                <p className="text-xs text-amber-600/80">{formatCurrency(totalOutstandingAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('paid')}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('Fully Paid', 'Lunas')}</p>
                <p className="text-lg font-bold text-emerald-600">{paidCustomers.length} {t('customers', 'customer')}</p>
                <p className="text-xs text-emerald-600/80">{formatCurrency(totalPaidAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('Search customer...', 'Cari customer...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overdue" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('Overdue', 'Jatuh Tempo Lewat')}
            <Badge variant="destructive" className="ml-1 text-[10px] h-5 px-1.5">{overdueCustomers.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="outstanding" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {t('Outstanding', 'Belum Lunas')}
            <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5">{outstandingCustomers.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="paid" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('Fully Paid', 'Lunas')}
            <Badge variant="outline" className="ml-1 text-[10px] h-5 px-1.5">{paidCustomers.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overdue" className="mt-4 space-y-3">
          {overdueCustomers.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
              {t('No overdue customers', 'Tidak ada customer jatuh tempo lewat')}
            </CardContent></Card>
          ) : (
            overdueCustomers.map(c => renderCustomerCard(c, c.overdueInvoices, 'overdue'))
          )}
        </TabsContent>

        <TabsContent value="outstanding" className="mt-4 space-y-3">
          {outstandingCustomers.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
              {t('No outstanding customers', 'Tidak ada customer dengan tagihan belum lunas')}
            </CardContent></Card>
          ) : (
            outstandingCustomers.map(c => renderCustomerCard(c, c.outstandingInvoices, 'outstanding'))
          )}
        </TabsContent>

        <TabsContent value="paid" className="mt-4 space-y-3">
          {paidCustomers.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
              {t('No fully paid customers', 'Tidak ada customer yang lunas')}
            </CardContent></Card>
          ) : (
            paidCustomers.map(c => renderCustomerCard(c, c.paidInvoices, 'paid'))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
