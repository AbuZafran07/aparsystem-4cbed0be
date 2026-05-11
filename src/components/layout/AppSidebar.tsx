import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Receipt, CreditCard, Wallet, Mail, MailCheck,
  Building2, Users, UserCircle, Clock, Landmark, Building, TrendingDown,
  TrendingUp, FileBarChart, FileBarChart2, DollarSign, Download, ArrowUpDown,
  ScrollText, Settings, UserCog, ClipboardList, Database, Plug,
  PanelLeftClose, PanelLeftOpen, Bell, List, PieChart,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRoleAccess } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { supabase } from '@/integrations/supabase/client';
import { useAuditConfig } from '@/contexts/AuditConfigContext';

const db = supabase as any;

interface MenuItem {
  key: string;
  translationKey: string;
  icon: React.ElementType;
  path: string;
}

interface MenuSection {
  sectionKey: string;
  items: MenuItem[];
}

const menuStructure: MenuSection[] = [
  {
    sectionKey: 'section.overview',
    items: [
      { key: 'dashboard', translationKey: 'menu.dashboard', icon: LayoutDashboard, path: '/dashboard' },
      { key: 'customerStatus', translationKey: 'menu.customerStatus', icon: Users, path: '/customer-status' },
    ],
  },
  {
    sectionKey: 'section.transactions',
    items: [
      { key: 'accountsPayable', translationKey: 'menu.accountsPayable', icon: FileText, path: '/ap' },
      { key: 'accountsReceivable', translationKey: 'menu.accountsReceivable', icon: Receipt, path: '/ar' },
      { key: 'apPayments', translationKey: 'menu.apPayments', icon: CreditCard, path: '/ap-payments' },
      { key: 'arReceipts', translationKey: 'menu.arReceipts', icon: Wallet, path: '/ar-receipts' },
    ],
  },
  {
    sectionKey: 'section.billing',
    items: [
      { key: 'billingLetters', translationKey: 'menu.billingLetters', icon: Mail, path: '/billing-letters' },
      { key: 'billingEmailLogs', translationKey: 'menu.billingEmailLogs', icon: MailCheck, path: '/billing-email-logs' },
      { key: 'paymentRequests', translationKey: 'menu.paymentRequestsAp', icon: ClipboardList, path: '/payment-requests' },
    ],
  },
  {
    sectionKey: 'section.masterData',
    items: [
      { key: 'vendors', translationKey: 'menu.vendors', icon: Building2, path: '/vendors' },
      { key: 'customers', translationKey: 'menu.customers', icon: Users, path: '/customers' },
      { key: 'sales', translationKey: 'menu.sales', icon: UserCircle, path: '/sales' },
      { key: 'paymentTerms', translationKey: 'menu.paymentTerms', icon: Clock, path: '/payment-terms' },
      { key: 'bankAccounts', translationKey: 'menu.bankAccounts', icon: Landmark, path: '/bank-accounts' },
      { key: 'companyProfile', translationKey: 'menu.companyProfile', icon: Building, path: '/company-profile' },
    ],
  },
  {
    sectionKey: 'section.reports',
    items: [
      { key: 'apAging', translationKey: 'menu.apAging', icon: TrendingDown, path: '/ap-aging' },
      { key: 'arAging', translationKey: 'menu.arAging', icon: TrendingUp, path: '/ar-aging' },
      { key: 'apReport', translationKey: 'menu.apReport', icon: FileBarChart, path: '/ap-report' },
      { key: 'arReport', translationKey: 'menu.arReport', icon: FileBarChart2, path: '/ar-report' },
      { key: 'cashflow', translationKey: 'menu.cashflow', icon: DollarSign, path: '/cashflow' },
      { key: 'exportCenter', translationKey: 'menu.exportCenter', icon: Download, path: '/export-center' },
      { key: 'importExportCenter', translationKey: 'menu.importExportCenter', icon: ArrowUpDown, path: '/import-export' },
    ],
  },
  {
    sectionKey: 'section.system',
    items: [
      { key: 'auditLogs', translationKey: 'menu.auditLogs', icon: ScrollText, path: '/audit-logs' },
      { key: 'userManagement', translationKey: 'menu.userManagement', icon: UserCog, path: '/users' },
      { key: 'systemSettings', translationKey: 'menu.systemSettings', icon: Settings, path: '/settings' },
      { key: 'backupRestore', translationKey: 'menu.backupRestore', icon: Database, path: '/backup-restore' },
      { key: 'integrationSettings', translationKey: 'menu.integrationSettings', icon: Plug, path: '/integration-settings' },
    ],
  },
];

// ── Audit sidebar items ────────────────────────────────────────────────────
interface AuditItem {
  key: string;
  label: string;
  icon: React.ElementType;
  path: string;
  exact?: boolean;
  badge?: number;
}

function AuditNavMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation();
  const { year: AUDIT_YEAR } = useAuditConfig();

  const { data: alertCount = 0 } = useQuery<number>({
    queryKey: ['audit-sidebar-alert-count', AUDIT_YEAR],
    queryFn: async () => {
      const [{ data: budgets }, { data: transactions }] = await Promise.all([
        db.from('budgets').select('department_id, amount').eq('year', AUDIT_YEAR),
        db.from('cash_out_transactions').select('department_id, nominal').eq('tahun', AUDIT_YEAR),
      ]);
      if (!budgets?.length || !transactions?.length) return 0;
      const budgetMap: Record<string, number> = Object.fromEntries(budgets.map((b: any) => [b.department_id, b.amount]));
      const spentMap: Record<string, number> = {};
      transactions.forEach((t: any) => { spentMap[t.department_id] = (spentMap[t.department_id] ?? 0) + t.nominal; });
      return Object.entries(spentMap).filter(([deptId, spent]) => {
        const budget = budgetMap[deptId] ?? 0;
        return budget > 0 && (spent as number) / budget >= 0.8;
      }).length;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const items: AuditItem[] = [
    { key: 'audit-dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/audit-cashout', exact: true },
    { key: 'audit-transaksi', label: 'Transaksi', icon: List, path: '/audit-cashout/transaksi' },
    { key: 'audit-budget', label: 'Budget Plan', icon: PieChart, path: '/audit-cashout/budget' },
    { key: 'audit-export', label: 'Export Laporan', icon: Download, path: '/audit-cashout/export' },
    { key: 'audit-alert', label: 'Alert', icon: Bell, path: '/audit-cashout/alert', badge: alertCount },
    { key: 'audit-settings', label: 'Pengaturan', icon: Settings, path: '/audit-cashout/settings' },
  ];

  return (
    <div>
      {!collapsed && (
        <div className="px-3 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Audit Cash Out
          </span>
        </div>
      )}
      <div className="space-y-0.5">
        {items.map(item => {
          const isActive = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);
          const Icon = item.icon;

          const linkContent = (
            <NavLink
              key={item.key}
              to={item.path}
              onClick={onNavigate}
              className={cn(
                'relative flex items-center rounded-lg text-sm font-medium transition-all duration-200',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              {isActive && <div className="sidebar-active-indicator" />}
              <div className="relative flex-shrink-0">
                <Icon className={cn('transition-all duration-200', collapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]')} />
                {/* Dot badge when collapsed */}
                {collapsed && item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </div>
              {!collapsed && (
                <>
                  <span className="truncate flex-1">{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center px-1">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8} className="font-medium">
                  {item.label}
                  {item.badge && item.badge > 0 ? ` (${item.badge} alert)` : ''}
                </TooltipContent>
              </Tooltip>
            );
          }
          return linkContent;
        })}
      </div>
    </div>
  );
}

// ── Main Sidebar ───────────────────────────────────────────────────────────
interface AppSidebarProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function AppSidebar({ onNavigate, collapsed = false, onToggleCollapse }: AppSidebarProps) {
  const { t } = useLanguage();
  const { canAccessMenu } = useRoleAccess();
  const location = useLocation();
  const { year: auditYear } = useAuditConfig();
  const isAuditRoute = location.pathname.startsWith('/audit-cashout');

  const filteredSections = menuStructure
    .map(section => ({
      ...section,
      items: section.items.filter(item => canAccessMenu(item.key)),
    }))
    .filter(section => section.items.length > 0);

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="h-full bg-sidebar flex flex-col overflow-hidden">
        {/* Logo */}
        <div className={cn(
          'h-16 flex items-center border-b border-sidebar-border/30 transition-all duration-300',
          collapsed ? 'px-0 justify-center' : 'px-5 gap-3'
        )}>
          <img
            src="/logo-kemika-new.png"
            alt="Kemika"
            className={cn('rounded-lg object-contain transition-all duration-300', collapsed ? 'w-8 h-8' : 'w-9 h-9')}
          />
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-base font-bold text-sidebar-foreground truncate">
                {isAuditRoute ? 'Audit Cash Out' : 'AP/AR HUB'}
              </span>
              <span className="text-xs text-sidebar-foreground/60 truncate">
                {isAuditRoute ? `Audit Module ${auditYear}` : 'Finance System'}
              </span>
            </div>
          )}
        </div>

        {/* Workspace Switcher */}
        <WorkspaceSwitcher collapsed={collapsed} />

        {/* Navigation */}
        <nav className={cn(
          'flex-1 overflow-y-auto py-4 scrollbar-thin transition-all duration-300',
          collapsed ? 'px-1.5' : 'px-3'
        )}>
          {isAuditRoute ? (
            <AuditNavMenu collapsed={collapsed} onNavigate={onNavigate} />
          ) : (
            filteredSections.map((section, sectionIdx) => (
              <div key={section.sectionKey} className={cn(sectionIdx > 0 && 'mt-5')}>
                {!collapsed && (
                  <div className="px-3 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                      {t(section.sectionKey)}
                    </span>
                  </div>
                )}
                {collapsed && sectionIdx > 0 && (
                  <div className="mx-2 mb-2 border-t border-sidebar-border/20" />
                )}
                <div className="space-y-0.5">
                  {section.items.map(item => {
                    const isActive = location.pathname === item.path ||
                      (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                    const Icon = item.icon;
                    const label = t(item.translationKey);

                    const linkContent = (
                      <NavLink
                        key={item.key}
                        to={item.path}
                        onClick={onNavigate}
                        className={cn(
                          'relative flex items-center rounded-lg text-sm font-medium transition-all duration-200',
                          collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-foreground'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        )}
                      >
                        {isActive && <div className="sidebar-active-indicator" />}
                        <Icon className={cn(
                          'flex-shrink-0 transition-all duration-200',
                          collapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]'
                        )} />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </NavLink>
                    );

                    if (collapsed) {
                      return (
                        <Tooltip key={item.key}>
                          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                          <TooltipContent side="right" sideOffset={8} className="font-medium">
                            {label}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    return linkContent;
                  })}
                </div>
              </div>
            ))
          )}
        </nav>

        {/* Collapse Toggle + Footer */}
        <div className="border-t border-sidebar-border/30">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className={cn(
                'w-full flex items-center gap-2 px-4 py-3 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-all duration-200',
                collapsed ? 'justify-center' : ''
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <>
                  <PanelLeftClose className="w-4 h-4" />
                  <span className="text-xs font-medium">Minimize</span>
                </>
              )}
            </button>
          )}
          {!collapsed && (
            <div className="px-4 pb-3 pt-1">
              <p className="text-[10px] text-sidebar-foreground/40 text-center">
                © 2026 PT. Kemika Karya Pratama
              </p>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
