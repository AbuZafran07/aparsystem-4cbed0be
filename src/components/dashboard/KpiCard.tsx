import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type KpiVariant = 'blue' | 'green' | 'purple' | 'red' | 'yellow';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: KpiVariant;
  className?: string;
}

const variantClasses: Record<KpiVariant, string> = {
  blue: 'kpi-card kpi-card-blue',
  green: 'kpi-card kpi-card-green',
  purple: 'kpi-card kpi-card-purple',
  red: 'kpi-card kpi-card-red',
  yellow: 'kpi-card kpi-card-yellow',
};

export default function KpiCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  variant = 'blue',
  className 
}: KpiCardProps) {
  return (
    <div className={cn(variantClasses[variant], className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium opacity-90 mb-1">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
          {subtitle && (
            <p className="text-sm opacity-75 mt-1">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
    </div>
  );
}
