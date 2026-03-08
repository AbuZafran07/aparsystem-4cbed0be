import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  CreditCard,
  Wallet,
  Mail,
  MailCheck,
  Building2,
  Users,
  UserCircle,
  Clock,
  Landmark,
  Building,
  TrendingDown,
  TrendingUp,
  FileBarChart,
  FileBarChart2,
  DollarSign,
  Download,
  ArrowUpDown,
  ScrollText,
  Settings,
  UserCog,
  ClipboardList,
  HardDriveDownload,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRoleAccess } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

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
      { key: 'backupRestore', translationKey: 'menu.backupRestore', icon: HardDriveDownload, path: '/backup-restore' },
    ],
  },
];

interface AppSidebarProps {
  onNavigate?: () => void;
}

export default function AppSidebar({ onNavigate }: AppSidebarProps) {
  const { t } = useLanguage();
  const { canAccessMenu } = useRoleAccess();
  const location = useLocation();

  const filteredSections = menuStructure
    .map(section => ({
      ...section,
      items: section.items.filter(item => canAccessMenu(item.key)),
    }))
    .filter(section => section.items.length > 0);

  return (
    <aside className="h-full bg-sidebar flex flex-col">
      {/* Logo Section */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border/30">
        <img src="/logo-kemika-new.png" alt="Kemika" className="w-9 h-9 rounded-lg object-contain" />
        <div className="flex flex-col">
          <span className="text-base font-bold text-sidebar-foreground">AP/AR HUB</span>
          <span className="text-xs text-sidebar-foreground/60">Finance System</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        {filteredSections.map((section, sectionIdx) => (
          <div key={section.sectionKey} className={cn(sectionIdx > 0 && 'mt-6')}>
            <div className="px-3 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {t(section.sectionKey)}
              </span>
            </div>
            <div className="space-y-1">
              {section.items.map(item => {
                const isActive = location.pathname === item.path || 
                  (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.key}
                    to={item.path}
                    onClick={onNavigate}
                    className={cn(
                      'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-foreground'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                    )}
                  >
                    {isActive && (
                      <div className="sidebar-active-indicator" />
                    )}
                    <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className="truncate">{t(item.translationKey)}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border/30">
        <p className="text-[10px] text-sidebar-foreground/40 text-center">
          © 2026 PT. Kemika Karya Pratama
        </p>
      </div>
    </aside>
  );
}
