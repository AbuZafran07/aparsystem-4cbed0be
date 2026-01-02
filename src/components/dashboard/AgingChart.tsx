import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

interface AgingBucket {
  label: string;
  amount: number;
  count: number;
}

interface AgingChartProps {
  title: string;
  buckets: AgingBucket[];
  type: 'ap' | 'ar';
}

const bucketColors = [
  'bg-success',
  'bg-info',
  'bg-warning',
  'bg-danger',
];

export default function AgingChart({ title, buckets, type }: AgingChartProps) {
  const { language } = useLanguage();
  
  const total = buckets.reduce((sum, b) => sum + b.amount, 0);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Bar Chart */}
        <div className="flex h-8 rounded-lg overflow-hidden mb-4">
          {buckets.map((bucket, idx) => {
            const percentage = total > 0 ? (bucket.amount / total) * 100 : 0;
            if (percentage === 0) return null;
            return (
              <div
                key={bucket.label}
                className={cn(bucketColors[idx], 'h-full transition-all')}
                style={{ width: `${percentage}%` }}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-3">
          {buckets.map((bucket, idx) => (
            <div key={bucket.label} className="flex items-center gap-2">
              <div className={cn('w-3 h-3 rounded-sm', bucketColors[idx])} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate">{bucket.label}</p>
                <p className="text-sm font-semibold text-foreground">{formatCurrency(bucket.amount)}</p>
                <p className="text-xs text-muted-foreground">
                  {bucket.count} {language === 'en' ? 'invoices' : 'invoice'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
