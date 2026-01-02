import React from 'react';
import { FileText, Receipt, CreditCard, AlertTriangle, Clock, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import KpiCard from '@/components/dashboard/KpiCard';
import AgingChart from '@/components/dashboard/AgingChart';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

// Mock data for dashboard
const mockApData = {
  totalOutstanding: 850000000,
  overdue: 125000000,
  draftCount: 5,
  submittedCount: 8,
  dueSoon: [
    { id: '1', vendor: 'PT. Supplier A', invoice: 'INV-001', dueDate: '2026-01-05', amount: 50000000 },
    { id: '2', vendor: 'PT. Supplier B', invoice: 'INV-002', dueDate: '2026-01-07', amount: 75000000 },
    { id: '3', vendor: 'PT. Supplier C', invoice: 'INV-003', dueDate: '2026-01-10', amount: 45000000 },
  ],
  aging: [
    { label: '0-30 days', amount: 450000000, count: 12 },
    { label: '31-60 days', amount: 225000000, count: 6 },
    { label: '61-90 days', amount: 100000000, count: 3 },
    { label: '90+ days', amount: 75000000, count: 2 },
  ],
};

const mockArData = {
  totalOutstanding: 1250000000,
  overdue: 320000000,
  overdueItems: [
    { id: '1', customer: 'PT. Customer X', invoice: 'AR-001', dueDate: '2025-12-20', amount: 120000000, overdueDays: 13 },
    { id: '2', customer: 'PT. Customer Y', invoice: 'AR-002', dueDate: '2025-12-25', amount: 80000000, overdueDays: 8 },
    { id: '3', customer: 'PT. Customer Z', invoice: 'AR-003', dueDate: '2025-12-28', amount: 120000000, overdueDays: 5 },
  ],
  aging: [
    { label: '0-30 days', amount: 550000000, count: 15 },
    { label: '31-60 days', amount: 280000000, count: 8 },
    { label: '61-90 days', amount: 200000000, count: 5 },
    { label: '90+ days', amount: 220000000, count: 4 },
  ],
};

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
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();

  const isPurchasing = user?.role === 'PURCHASING';
  const isFinanceOrSuper = user?.role === 'FINANCE' || user?.role === 'SUPER_ADMIN';

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
              value={formatCurrency(mockApData.totalOutstanding)}
              icon={FileText}
              variant="blue"
            />
            <KpiCard
              title={t('kpi.totalArOutstanding')}
              value={formatCurrency(mockArData.totalOutstanding)}
              icon={Receipt}
              variant="green"
            />
            <KpiCard
              title={t('kpi.apOverdue')}
              value={formatCurrency(mockApData.overdue)}
              icon={AlertTriangle}
              variant="yellow"
            />
            <KpiCard
              title={t('kpi.arOverdue')}
              value={formatCurrency(mockArData.overdue)}
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
              value={mockApData.draftCount}
              subtitle={language === 'en' ? 'Pending submission' : 'Menunggu pengajuan'}
              icon={FileText}
              variant="blue"
            />
            <KpiCard
              title={t('kpi.apSubmitted')}
              value={mockApData.submittedCount}
              subtitle={language === 'en' ? 'Awaiting approval' : 'Menunggu persetujuan'}
              icon={Clock}
              variant="yellow"
            />
            <KpiCard
              title={t('kpi.totalApOutstanding')}
              value={formatCurrency(mockApData.totalOutstanding)}
              icon={CreditCard}
              variant="green"
            />
            <KpiCard
              title={t('kpi.apOverdue')}
              value={formatCurrency(mockApData.overdue)}
              icon={AlertTriangle}
              variant="red"
            />
          </>
        )}

        {/* Admin sees system overview */}
        {user?.role === 'ADMIN' && (
          <>
            <KpiCard
              title={language === 'en' ? 'Total Vendors' : 'Total Vendor'}
              value="24"
              icon={FileText}
              variant="blue"
            />
            <KpiCard
              title={language === 'en' ? 'Total Customers' : 'Total Customer'}
              value="18"
              icon={Receipt}
              variant="green"
            />
            <KpiCard
              title={language === 'en' ? 'Active Sales' : 'Sales Aktif'}
              value="8"
              icon={Clock}
              variant="purple"
            />
            <KpiCard
              title={language === 'en' ? 'Bank Accounts' : 'Rekening Bank'}
              value="5"
              icon={CreditCard}
              variant="yellow"
            />
          </>
        )}
      </div>

      {/* Charts and Tables Row */}
      {isFinanceOrSuper && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AP Aging Chart */}
          <AgingChart
            title={language === 'en' ? 'AP Aging Analysis' : 'Analisis Aging AP'}
            buckets={mockApData.aging}
            type="ap"
          />

          {/* AR Aging Chart */}
          <AgingChart
            title={language === 'en' ? 'AR Aging Analysis' : 'Analisis Aging AR'}
            buckets={mockArData.aging}
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
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-warning" />
                {language === 'en' ? 'AP Due Soon' : 'AP Segera Jatuh Tempo'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockApData.dueSoon.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.vendor}</p>
                      <p className="text-xs text-muted-foreground">{item.invoice}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-semibold text-foreground">{formatFullCurrency(item.amount)}</p>
                      <p className="text-xs text-warning">{item.dueDate}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* AR Overdue Table with Actions */}
        {isFinanceOrSuper && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-danger" />
                {language === 'en' ? 'AR Overdue' : 'AR Jatuh Tempo'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockArData.overdueItems.map((item) => (
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
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        {t('btn.generateBillingLetter')}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        {t('btn.sendBillingEmail')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
