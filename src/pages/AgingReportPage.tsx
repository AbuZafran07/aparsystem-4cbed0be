import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download, FileText, Receipt, RefreshCw, Loader2, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { exportToExcel, exportToPDF, ExportColumn } from '@/lib/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface AgingBucket {
  label: string;
  range: string;
  min: number;
  max: number | null;
  amount: number;
  count: number;
  invoices: AgingInvoice[];
}

interface AgingInvoice {
  id: string;
  invoice_number: string;
  name: string;
  invoice_date: string;
  due_date: string;
  outstanding_amount: number;
  overdue_days: number;
}

const AGING_BUCKETS = [
  { label: '0-30', range: '0-30 days', min: 0, max: 30 },
  { label: '31-60', range: '31-60 days', min: 31, max: 60 },
  { label: '61-90', range: '61-90 days', min: 61, max: 90 },
  { label: '>90', range: '90+ days', min: 91, max: null },
];

const CHART_COLORS = ['hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(25, 95%, 53%)', 'hsl(0, 84%, 60%)'];

const formatCurrency = (amount: number) => {
  if (amount >= 1000000000) {
    return `Rp ${(amount / 1000000000).toFixed(1)}B`;
  }
  if (amount >= 1000000) {
    return `Rp ${(amount / 1000000).toFixed(0)}M`;
  }
  return `Rp ${(amount / 1000).toFixed(0)}K`;
};

const formatFullCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

export default function AgingReportPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'ap' | 'ar'>('ar');
  const [loading, setLoading] = useState(true);
  const [apBuckets, setApBuckets] = useState<AgingBucket[]>([]);
  const [arBuckets, setArBuckets] = useState<AgingBucket[]>([]);

  useEffect(() => {
    fetchAgingData();
  }, []);

  const fetchAgingData = async () => {
    try {
      setLoading(true);

      // Fetch AP invoices with outstanding amounts
      const { data: apData, error: apError } = await supabase
        .from('ap_invoices')
        .select(`*, vendors (vendor_name)`)
        .gt('outstanding_amount', 0)
        .in('status', ['APPROVED', 'PARTIAL']);

      if (apError) throw apError;

      // Fetch AR invoices with outstanding amounts
      const { data: arData, error: arError } = await supabase
        .from('ar_invoices')
        .select(`*, customers (customer_name)`)
        .gt('outstanding_amount', 0)
        .in('status', ['APPROVED', 'PARTIAL']);

      if (arError) throw arError;

      // Calculate AP aging buckets
      const apBucketsData = calculateAgingBuckets(apData || [], 'ap');
      setApBuckets(apBucketsData);

      // Calculate AR aging buckets
      const arBucketsData = calculateAgingBuckets(arData || [], 'ar');
      setArBuckets(arBucketsData);

    } catch (error: any) {
      console.error('Error fetching aging data:', error);
      toast.error(language === 'en' ? 'Failed to load aging data' : 'Gagal memuat data aging');
    } finally {
      setLoading(false);
    }
  };

  const calculateAgingBuckets = (invoices: any[], type: 'ap' | 'ar'): AgingBucket[] => {
    const today = new Date();
    
    return AGING_BUCKETS.map(bucket => {
      const bucketInvoices = invoices.filter(inv => {
        const dueDate = new Date(inv.due_date);
        const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const overdueDays = Math.max(0, daysDiff);
        
        if (bucket.max === null) {
          return overdueDays >= bucket.min;
        }
        return overdueDays >= bucket.min && overdueDays <= bucket.max;
      });

      const totalAmount = bucketInvoices.reduce((sum, inv) => sum + (inv.outstanding_amount || 0), 0);
      
      const invoiceDetails: AgingInvoice[] = bucketInvoices.map(inv => {
        const dueDate = new Date(inv.due_date);
        const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          id: inv.id,
          invoice_number: type === 'ap' ? inv.vendor_invoice_number : inv.invoice_number,
          name: type === 'ap' ? inv.vendors?.vendor_name : inv.customers?.customer_name,
          invoice_date: inv.invoice_date,
          due_date: inv.due_date,
          outstanding_amount: inv.outstanding_amount,
          overdue_days: Math.max(0, daysDiff),
        };
      });

      return {
        label: bucket.label,
        range: bucket.range,
        min: bucket.min,
        max: bucket.max,
        amount: totalAmount,
        count: bucketInvoices.length,
        invoices: invoiceDetails,
      };
    });
  };

  const handleExport = (type: 'ap' | 'ar', format: 'excel' | 'pdf') => {
    const buckets = type === 'ap' ? apBuckets : arBuckets;
    const allInvoices = buckets.flatMap(b => 
      b.invoices.map(inv => ({
        ...inv,
        aging_bucket: b.range,
      }))
    );

    const columns: ExportColumn[] = [
      { key: 'name', header: language === 'en' ? 'Name' : 'Nama' },
      { key: 'invoice_number', header: language === 'en' ? 'Invoice Number' : 'No Invoice' },
      { key: 'invoice_date', header: language === 'en' ? 'Invoice Date' : 'Tanggal Invoice' },
      { key: 'due_date', header: language === 'en' ? 'Due Date' : 'Jatuh Tempo' },
      { key: 'outstanding_amount', header: language === 'en' ? 'Outstanding' : 'Outstanding', format: (v) => formatFullCurrency(v) },
      { key: 'overdue_days', header: language === 'en' ? 'Overdue Days' : 'Hari Jatuh Tempo' },
      { key: 'aging_bucket', header: language === 'en' ? 'Aging Bucket' : 'Bucket Aging' },
    ];

    const filename = `${type.toUpperCase()}_Aging_Report`;
    const title = type === 'ap'
      ? (language === 'en' ? 'AP Aging Report' : 'Laporan Aging AP')
      : (language === 'en' ? 'AR Aging Report' : 'Laporan Aging AR');

    if (format === 'pdf') {
      exportToPDF(allInvoices, columns, filename, title);
    } else {
      exportToExcel(allInvoices, columns, filename);
    }
    toast.success(language === 'en' ? 'Report exported' : 'Laporan diekspor');
  };

  const chartData = (activeTab === 'ap' ? apBuckets : arBuckets).map((bucket, index) => ({
    name: bucket.label,
    amount: bucket.amount,
    count: bucket.count,
    fill: CHART_COLORS[index],
  }));

  const totalAmount = chartData.reduce((sum, item) => sum + item.amount, 0);
  const totalCount = chartData.reduce((sum, item) => sum + item.count, 0);

  const pieData = chartData.map((item, index) => ({
    name: item.name,
    value: item.amount,
    fill: CHART_COLORS[index],
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Aging Report' : 'Laporan Aging'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Outstanding invoice aging analysis' : 'Analisis aging invoice outstanding'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAgingData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {language === 'en' ? 'Refresh' : 'Refresh'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Download className="w-4 h-4 mr-2" />
                {language === 'en' ? 'Export' : 'Ekspor'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport(activeTab, 'excel')}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport(activeTab, 'pdf')}>
                <FileText className="w-4 h-4 mr-2" />
                Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'ap' | 'ar')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="ar" className="flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            {language === 'en' ? 'AR Aging' : 'Aging AR'}
          </TabsTrigger>
          <TabsTrigger value="ap" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {language === 'en' ? 'AP Aging' : 'Aging AP'}
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <TabsContent value="ar" className="space-y-6 mt-6">
              <AgingContent
                buckets={arBuckets}
                chartData={chartData}
                pieData={pieData}
                totalAmount={totalAmount}
                totalCount={totalCount}
                language={language}
                type="ar"
              />
            </TabsContent>
            <TabsContent value="ap" className="space-y-6 mt-6">
              <AgingContent
                buckets={apBuckets}
                chartData={chartData}
                pieData={pieData}
                totalAmount={totalAmount}
                totalCount={totalCount}
                language={language}
                type="ap"
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

interface AgingContentProps {
  buckets: AgingBucket[];
  chartData: any[];
  pieData: any[];
  totalAmount: number;
  totalCount: number;
  language: string;
  type: 'ap' | 'ar';
}

function AgingContent({ buckets, chartData, pieData, totalAmount, totalCount, language, type }: AgingContentProps) {
  const [expandedBuckets, setExpandedBuckets] = React.useState<Record<string, boolean>>({});
  const navigate = useNavigate();

  const toggleBucket = (label: string) => {
    setExpandedBuckets(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const handleInvoiceClick = (invoiceId: string) => {
    const path = type === 'ar' ? `/ar/${invoiceId}` : `/ap/${invoiceId}`;
    navigate(path);
  };

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {buckets.map((bucket, index) => (
          <Card key={bucket.label} className="border-l-4" style={{ borderLeftColor: CHART_COLORS[index] }}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{bucket.range}</p>
              <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(bucket.amount)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {bucket.count} {language === 'en' ? 'invoices' : 'invoice'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {language === 'en' ? 'Aging by Amount' : 'Aging berdasarkan Jumlah'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
                  <YAxis 
                    tickFormatter={(value) => formatCurrency(value)}
                    className="text-xs fill-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value: number) => [formatFullCurrency(value), language === 'en' ? 'Amount' : 'Jumlah']}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {language === 'en' ? 'Aging Distribution' : 'Distribusi Aging'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [formatFullCurrency(value), '']}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{language === 'en' ? 'Detailed Aging' : 'Detail Aging'}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {language === 'en' ? 'Total' : 'Total'}: {formatFullCurrency(totalAmount)} ({totalCount} {language === 'en' ? 'invoices' : 'invoice'})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {buckets.map((bucket, index) => (
              <div key={bucket.label} className="border rounded-lg overflow-hidden">
                <div 
                  className="px-4 py-3 font-medium flex items-center justify-between"
                  style={{ backgroundColor: `${CHART_COLORS[index]}15` }}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[index] }} />
                    {bucket.range}
                  </span>
                  <span>{formatFullCurrency(bucket.amount)} ({bucket.count})</span>
                </div>
                {bucket.invoices.length > 0 && (
                  <div className="divide-y">
                    {(expandedBuckets[bucket.label] ? bucket.invoices : bucket.invoices.slice(0, 5)).map(inv => (
                      <div key={inv.id} className="px-4 py-2 flex items-center justify-between text-sm hover:bg-muted/50">
                        <div>
                          <span className="font-medium">{inv.name}</span>
                          <span className="text-muted-foreground ml-2">({inv.invoice_number})</span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium">{formatFullCurrency(inv.outstanding_amount)}</span>
                          {inv.overdue_days > 0 && (
                            <span className="text-danger ml-2 text-xs">
                              {inv.overdue_days} {language === 'en' ? 'days' : 'hari'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {bucket.invoices.length > 5 && (
                      <button
                        onClick={() => toggleBucket(bucket.label)}
                        className="w-full px-4 py-2 text-sm text-primary hover:bg-muted/50 text-center cursor-pointer font-medium transition-colors"
                      >
                        {expandedBuckets[bucket.label]
                          ? (language === 'en' ? 'Show less' : 'Tampilkan lebih sedikit')
                          : `+${bucket.invoices.length - 5} ${language === 'en' ? 'more invoices' : 'invoice lainnya'}`
                        }
                      </button>
                    )}
                  </div>
                )}
                {bucket.invoices.length === 0 && (
                  <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                    {language === 'en' ? 'No invoices in this bucket' : 'Tidak ada invoice di bucket ini'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
