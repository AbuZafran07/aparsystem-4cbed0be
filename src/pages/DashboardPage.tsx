import React, { useState, useEffect } from 'react';
import { FileText, Receipt, CreditCard, AlertTriangle, Clock, TrendingDown, TrendingUp, Users, Building2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import KpiCard from '@/components/dashboard/KpiCard';
import AgingChart from '@/components/dashboard/AgingChart';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

interface AgingBucket {
  label: string;
  amount: number;
  count: number;
}

interface DashboardData {
  apTotal: number;
  apOverdue: number;
  apDraft: number;
  apSubmitted: number;
  arTotal: number;
  arOverdue: number;
  arDraft: number;
  arSubmitted: number;
  apAging: AgingBucket[];
  arAging: AgingBucket[];
  apDueSoon: any[];
  arOverdueItems: any[];
  vendorCount: number;
  customerCount: number;
  salesCount: number;
  bankCount: number;
  monthlyTrend: any[];
  totalArReceived: number;
  totalApPaid: number;
  monthlyComparison: { month: string; arReceived: number; apPaid: number }[];
}

const formatCurrency = (amount: number, compact = false) => {
  if (compact) {
    if (Math.abs(amount) >= 1000000000) {
      return `Rp ${(amount / 1000000000).toFixed(1)}B`;
    }
    if (Math.abs(amount) >= 1000000) {
      return `Rp ${(amount / 1000000).toFixed(1)}Jt`;
    }
    if (Math.abs(amount) >= 1000) {
      return `Rp ${(amount / 1000).toFixed(0)}K`;
    }
    return `Rp ${amount.toFixed(0)}`;
  }
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

const formatFullCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const calculateAgingBuckets = (invoices: any[]): AgingBucket[] => {
  const today = new Date();
  const buckets = [
    { label: '0-30 days', min: 0, max: 30, amount: 0, count: 0 },
    { label: '31-60 days', min: 31, max: 60, amount: 0, count: 0 },
    { label: '61-90 days', min: 61, max: 90, amount: 0, count: 0 },
    { label: '90+ days', min: 91, max: null, amount: 0, count: 0 },
  ];

  invoices.forEach(inv => {
    const dueDate = new Date(inv.due_date);
    const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const overdueDays = Math.max(0, daysDiff);

    for (const bucket of buckets) {
      if (bucket.max === null) {
        if (overdueDays >= bucket.min) {
          bucket.amount += inv.outstanding_amount || 0;
          bucket.count++;
          break;
        }
      } else if (overdueDays >= bucket.min && overdueDays <= bucket.max) {
        bucket.amount += inv.outstanding_amount || 0;
        bucket.count++;
        break;
      }
    }
  });

  return buckets.map(b => ({ label: b.label, amount: b.amount, count: b.count }));
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData>({
    apTotal: 0,
    apOverdue: 0,
    apDraft: 0,
    apSubmitted: 0,
    arTotal: 0,
    arOverdue: 0,
    arDraft: 0,
    arSubmitted: 0,
    apAging: [],
    arAging: [],
    apDueSoon: [],
    arOverdueItems: [],
    vendorCount: 0,
    customerCount: 0,
    salesCount: 0,
    bankCount: 0,
    monthlyTrend: [],
    totalArReceived: 0,
    totalApPaid: 0,
    monthlyComparison: [],
  });

  const isPurchasing = user?.role === 'PURCHASING';
  const isFinanceOrSuper = user?.role === 'FINANCE' || user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch AP invoices
      const { data: apInvoices, error: apError } = await supabase
        .from('ap_invoices')
        .select(`*, vendors (vendor_name)`)
        .in('status', ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIAL']);

      if (apError) throw apError;

      // Fetch AR invoices
      const { data: arInvoices, error: arError } = await supabase
        .from('ar_invoices')
        .select(`*, customers (customer_name)`)
        .in('status', ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIAL']);

      if (arError) throw arError;

      // Fetch counts
      const [vendorRes, customerRes, salesRes, bankRes] = await Promise.all([
        supabase.from('vendors').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('customers').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('sales').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('bank_accounts').select('id', { count: 'exact' }).eq('is_active', true),
      ]);

      const today = new Date();

      // Calculate AP metrics
      const apTotal = (apInvoices || [])
        .filter(inv => ['APPROVED', 'PARTIAL'].includes(inv.status))
        .reduce((sum, inv) => sum + (inv.outstanding_amount || 0), 0);

      const apOverdue = (apInvoices || [])
        .filter(inv => {
          const dueDate = new Date(inv.due_date);
          return ['APPROVED', 'PARTIAL'].includes(inv.status) && dueDate < today && inv.outstanding_amount > 0;
        })
        .reduce((sum, inv) => sum + (inv.outstanding_amount || 0), 0);

      const apDraft = (apInvoices || []).filter(inv => inv.status === 'DRAFT').length;
      const apSubmitted = (apInvoices || []).filter(inv => inv.status === 'SUBMITTED').length;

      // Calculate AR metrics
      const arTotal = (arInvoices || [])
        .filter(inv => ['APPROVED', 'PARTIAL'].includes(inv.status))
        .reduce((sum, inv) => sum + (inv.outstanding_amount || 0), 0);

      const arOverdue = (arInvoices || [])
        .filter(inv => {
          const dueDate = new Date(inv.due_date);
          return ['APPROVED', 'PARTIAL'].includes(inv.status) && dueDate < today && inv.outstanding_amount > 0;
        })
        .reduce((sum, inv) => sum + (inv.outstanding_amount || 0), 0);

      const arDraft = (arInvoices || []).filter(inv => inv.status === 'DRAFT').length;
      const arSubmitted = (arInvoices || []).filter(inv => inv.status === 'SUBMITTED').length;

      // Calculate aging
      const apAgingData = calculateAgingBuckets(
        (apInvoices || []).filter(inv => ['APPROVED', 'PARTIAL'].includes(inv.status) && inv.outstanding_amount > 0)
      );
      const arAgingData = calculateAgingBuckets(
        (arInvoices || []).filter(inv => ['APPROVED', 'PARTIAL'].includes(inv.status) && inv.outstanding_amount > 0)
      );

      // AP due soon (within 7 days)
      const sevenDaysLater = new Date();
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

      const apDueSoon = (apInvoices || [])
        .filter(inv => {
          const dueDate = new Date(inv.due_date);
          return ['APPROVED', 'PARTIAL'].includes(inv.status) && 
                 dueDate >= today && dueDate <= sevenDaysLater && 
                 inv.outstanding_amount > 0;
        })
        .map(inv => ({
          id: inv.id,
          vendor: inv.vendors?.vendor_name || 'Unknown',
          invoice: inv.vendor_invoice_number,
          dueDate: inv.due_date,
          amount: inv.outstanding_amount,
        }))
        .slice(0, 5);

      // AR overdue items
      const arOverdueItems = (arInvoices || [])
        .filter(inv => {
          const dueDate = new Date(inv.due_date);
          return ['APPROVED', 'PARTIAL'].includes(inv.status) && 
                 dueDate < today && inv.outstanding_amount > 0;
        })
        .map(inv => {
          const dueDate = new Date(inv.due_date);
          const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: inv.id,
            customer: inv.customers?.customer_name || 'Unknown',
            invoice: inv.invoice_number,
            dueDate: inv.due_date,
            amount: inv.outstanding_amount,
            overdueDays: daysDiff,
          };
        })
        .sort((a, b) => b.overdueDays - a.overdueDays)
        .slice(0, 5);

      // Fetch AR receipts and AP payments for comparison
      const [arReceiptsRes, apPaymentsRes] = await Promise.all([
        supabase.from('ar_receipts').select('total_amount, receipt_date'),
        supabase.from('ap_payments').select('total_amount, payment_date'),
      ]);

      const arReceipts = arReceiptsRes.data || [];
      const apPayments = apPaymentsRes.data || [];

      const totalArReceived = arReceipts.reduce((sum, r) => sum + (r.total_amount || 0), 0);
      const totalApPaid = apPayments.reduce((sum, p) => sum + (p.total_amount || 0), 0);

      // Monthly comparison (last 6 months) - real data
      const monthlyComparison: { month: string; arReceived: number; apPaid: number }[] = [];
      const monthlyTrend: any[] = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const year = date.getFullYear();
        const month = date.getMonth();
        const monthName = date.toLocaleDateString('id-ID', { month: 'short' });
        const startOfMonth = new Date(year, month, 1).toISOString().split('T')[0];
        const endOfMonth = new Date(year, month + 1, 0).toISOString().split('T')[0];

        const monthArReceived = arReceipts
          .filter(r => r.receipt_date >= startOfMonth && r.receipt_date <= endOfMonth)
          .reduce((sum, r) => sum + (r.total_amount || 0), 0);

        const monthApPaid = apPayments
          .filter(p => p.payment_date >= startOfMonth && p.payment_date <= endOfMonth)
          .reduce((sum, p) => sum + (p.total_amount || 0), 0);

        monthlyComparison.push({ month: monthName, arReceived: monthArReceived, apPaid: monthApPaid });
        monthlyTrend.push({ month: monthName, ap: monthApPaid, ar: monthArReceived });
      }

      setData({
        apTotal,
        apOverdue,
        apDraft,
        apSubmitted,
        arTotal,
        arOverdue,
        arDraft,
        arSubmitted,
        apAging: apAgingData,
        arAging: arAgingData,
        apDueSoon,
        arOverdueItems,
        vendorCount: vendorRes.count || 0,
        customerCount: customerRes.count || 0,
        salesCount: salesRes.count || 0,
        bankCount: bankRes.count || 0,
        monthlyTrend,
        totalArReceived,
        totalApPaid,
        monthlyComparison,
      });

    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      toast.error(language === 'en' ? 'Failed to load dashboard' : 'Gagal memuat dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {language === 'en' 
            ? `Welcome back, ${user?.name}` 
            : `Selamat datang, ${user?.name}`}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Finance/Super Admin sees full KPIs */}
        {isFinanceOrSuper && (
          <>
            <KpiCard
              title={t('kpi.totalApOutstanding')}
              value={formatCurrency(data.apTotal)}
              subtitle={`${data.apDraft + data.apSubmitted} ${language === 'en' ? 'pending' : 'pending'}`}
              icon={FileText}
              variant="blue"
            />
            <KpiCard
              title={t('kpi.totalArOutstanding')}
              value={formatCurrency(data.arTotal)}
              subtitle={`${data.arDraft + data.arSubmitted} ${language === 'en' ? 'pending' : 'pending'}`}
              icon={Receipt}
              variant="green"
            />
            <KpiCard
              title={t('kpi.apOverdue')}
              value={formatCurrency(data.apOverdue)}
              icon={AlertTriangle}
              variant="yellow"
            />
            <KpiCard
              title={t('kpi.arOverdue')}
              value={formatCurrency(data.arOverdue)}
              icon={TrendingDown}
              variant="red"
            />
          </>
        )}

        {/* Purchasing sees limited KPIs */}
        {isPurchasing && (
          <>
            <KpiCard
              title={t('kpi.apDraft')}
              value={data.apDraft}
              subtitle={language === 'en' ? 'Pending submission' : 'Menunggu pengajuan'}
              icon={FileText}
              variant="blue"
            />
            <KpiCard
              title={t('kpi.apSubmitted')}
              value={data.apSubmitted}
              subtitle={language === 'en' ? 'Awaiting approval' : 'Menunggu persetujuan'}
              icon={Clock}
              variant="yellow"
            />
            <KpiCard
              title={t('kpi.totalApOutstanding')}
              value={formatCurrency(data.apTotal)}
              icon={CreditCard}
              variant="green"
            />
            <KpiCard
              title={t('kpi.apOverdue')}
              value={formatCurrency(data.apOverdue)}
              icon={AlertTriangle}
              variant="red"
            />
          </>
        )}

        {/* Admin sees system overview */}
        {isAdmin && (
          <>
            <KpiCard
              title={language === 'en' ? 'Total Vendors' : 'Total Vendor'}
              value={data.vendorCount.toString()}
              icon={Building2}
              variant="blue"
            />
            <KpiCard
              title={language === 'en' ? 'Total Customers' : 'Total Customer'}
              value={data.customerCount.toString()}
              icon={Users}
              variant="green"
            />
            <KpiCard
              title={language === 'en' ? 'Active Sales' : 'Sales Aktif'}
              value={data.salesCount.toString()}
              icon={TrendingUp}
              variant="purple"
            />
            <KpiCard
              title={language === 'en' ? 'Bank Accounts' : 'Rekening Bank'}
              value={data.bankCount.toString()}
              icon={CreditCard}
              variant="yellow"
            />
          </>
        )}
      </div>

      {/* AR Received vs AP Paid Comparison */}
      {true && (
        <>
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              title={language === 'en' ? 'Total AR Received' : 'Total AR Masuk'}
              value={formatCurrency(data.totalArReceived)}
              subtitle={language === 'en' ? 'All time receipts' : 'Total penerimaan'}
              icon={TrendingUp}
              variant="green"
            />
            <KpiCard
              title={language === 'en' ? 'Total AP Paid' : 'Total AP Keluar'}
              value={formatCurrency(data.totalApPaid)}
              subtitle={language === 'en' ? 'All time payments' : 'Total pembayaran'}
              icon={TrendingDown}
              variant="red"
            />
            <KpiCard
              title={language === 'en' ? 'Net Cashflow' : 'Arus Kas Bersih'}
              value={formatCurrency(data.totalArReceived - data.totalApPaid)}
              subtitle={data.totalArReceived - data.totalApPaid >= 0 
                ? (language === 'en' ? 'Positive' : 'Positif') 
                : (language === 'en' ? 'Negative' : 'Negatif')}
              icon={CreditCard}
              variant={data.totalArReceived - data.totalApPaid >= 0 ? 'green' : 'red'}
            />
          </div>

          {/* Monthly AR vs AP Bar Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                {language === 'en' ? 'AR Received vs AP Paid (6 Months)' : 'Perbandingan AR Masuk vs AP Keluar (6 Bulan)'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthlyComparison} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
                    <YAxis 
                      tickFormatter={(value) => formatCurrency(value, true)}
                      className="text-xs fill-muted-foreground"
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatFullCurrency(value),
                        name === 'arReceived' 
                          ? (language === 'en' ? 'AR Received' : 'AR Masuk') 
                          : (language === 'en' ? 'AP Paid' : 'AP Keluar')
                      ]}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    />
                    <Legend 
                      formatter={(value) => 
                        value === 'arReceived' 
                          ? (language === 'en' ? 'AR Received' : 'AR Masuk') 
                          : (language === 'en' ? 'AP Paid' : 'AP Keluar')
                      }
                    />
                    <Bar dataKey="arReceived" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="apPaid" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Trend Chart for Finance/Super Admin */}
      {isFinanceOrSuper && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {language === 'en' ? 'Outstanding Trend (6 Months)' : 'Trend Outstanding (6 Bulan)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthlyTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorAr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
                  <YAxis 
                    tickFormatter={(value) => formatCurrency(value, true)}
                    className="text-xs fill-muted-foreground"
                  />
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatFullCurrency(value),
                      name === 'ap' ? 'AP Outstanding' : 'AR Outstanding'
                    ]}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="ap" 
                    stroke="hsl(217, 91%, 60%)" 
                    fillOpacity={1} 
                    fill="url(#colorAp)" 
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="ar" 
                    stroke="hsl(142, 71%, 45%)" 
                    fillOpacity={1} 
                    fill="url(#colorAr)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(217, 91%, 60%)' }} />
                <span className="text-sm text-muted-foreground">AP Outstanding</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(142, 71%, 45%)' }} />
                <span className="text-sm text-muted-foreground">AR Outstanding</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts and Tables Row */}
      {isFinanceOrSuper && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AP Aging Chart */}
          <AgingChart
            title={language === 'en' ? 'AP Aging Analysis' : 'Analisis Aging AP'}
            buckets={data.apAging}
            type="ap"
          />

          {/* AR Aging Chart */}
          <AgingChart
            title={language === 'en' ? 'AR Aging Analysis' : 'Analisis Aging AR'}
            buckets={data.arAging}
            type="ar"
          />
        </div>
      )}

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AP Due Soon Table */}
        {(isFinanceOrSuper || isPurchasing) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-warning" />
                  {language === 'en' ? 'AP Due Soon' : 'AP Segera Jatuh Tempo'}
                </div>
                <Link to="/ap">
                  <Button variant="ghost" size="sm" className="text-xs">
                    {language === 'en' ? 'View All' : 'Lihat Semua'}
                  </Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.apDueSoon.length > 0 ? (
                <div className="space-y-3">
                  {data.apDueSoon.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.vendor}</p>
                          <p className="text-xs text-muted-foreground">{item.invoice}</p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-sm font-semibold text-foreground">{formatFullCurrency(item.amount)}</p>
                          <p className="text-xs text-warning">{item.dueDate}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Link to="/payment-requests">
                          <Button size="sm" variant="outline" className="text-xs h-7">
                            {language === 'en' ? 'Create Payment Request' : 'Buat Pengajuan Pembayaran'}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {language === 'en' ? 'No invoices due soon' : 'Tidak ada invoice segera jatuh tempo'}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* AR Overdue Table with Actions */}
        {isFinanceOrSuper && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger" />
                  {language === 'en' ? 'AR Overdue' : 'AR Jatuh Tempo'}
                </div>
                <Link to="/ar">
                  <Button variant="ghost" size="sm" className="text-xs">
                    {language === 'en' ? 'View All' : 'Lihat Semua'}
                  </Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.arOverdueItems.length > 0 ? (
                <div className="space-y-3">
                  {data.arOverdueItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.customer}</p>
                          <p className="text-xs text-muted-foreground">{item.invoice}</p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-sm font-semibold text-foreground">{formatFullCurrency(item.amount)}</p>
                          <Badge variant="destructive" className="text-[10px]">
                            {item.overdueDays} {language === 'en' ? 'days' : 'hari'}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Link to="/billing-letters">
                          <Button size="sm" variant="outline" className="text-xs h-7">
                            {t('btn.generateBillingLetter')}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {language === 'en' ? 'No overdue invoices' : 'Tidak ada invoice jatuh tempo'}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
