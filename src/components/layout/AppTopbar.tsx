import React from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

const roleColors: Record<string, string> = {
  SUPER_ADMIN: 'bg-danger text-danger-foreground',
  ADMIN: 'bg-info text-info-foreground',
  FINANCE: 'bg-success text-success-foreground',
  PURCHASING: 'bg-warning text-warning-foreground',
};

const roleLabels: Record<string, { en: string; id: string }> = {
  SUPER_ADMIN: { en: 'Super Admin', id: 'Super Admin' },
  ADMIN: { en: 'Admin', id: 'Admin' },
  FINANCE: { en: 'Finance', id: 'Finance' },
  PURCHASING: { en: 'Purchasing', id: 'Purchasing' },
};

interface AppTopbarProps {
  pageTitle?: string;
}

export default function AppTopbar({ pageTitle }: AppTopbarProps) {
  const { user, logout } = useAuth();
  const { t, language, toggleLanguage } = useLanguage();

  if (!user) return null;

  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6">
      {/* Page Title */}
      <div>
        {pageTitle && (
          <h1 className="text-xl font-semibold text-foreground">{pageTitle}</h1>
        )}
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Language Toggle */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
        >
          <span className={cn(language === 'en' && 'text-foreground font-semibold')}>EN</span>
          <span className="text-muted-foreground/50">|</span>
          <span className={cn(language === 'id' && 'text-foreground font-semibold')}>ID</span>
        </button>

        {/* User Info */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">{user.name}</p>
            <Badge className={cn('text-[10px] px-2 py-0', roleColors[user.role])}>
              {roleLabels[user.role]?.[language] || user.role}
            </Badge>
          </div>

          {/* Logout Button */}
          <Button
            variant="destructive"
            size="sm"
            onClick={logout}
            className="gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">{t('btn.logout')}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
