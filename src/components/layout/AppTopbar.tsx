import React, { useState, useEffect } from 'react';
import { LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
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
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Fetch avatar URL
  useEffect(() => {
    const fetchAvatar = async () => {
      if (!user?.id) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', user.id)
        .single();
      
      if (data?.avatar_url) {
        setAvatarUrl(data.avatar_url);
      }
    };
    
    fetchAvatar();
  }, [user?.id]);

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

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

        {/* User Info with Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 hover:bg-muted p-2 rounded-lg transition-colors">
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">{user.name}</p>
                <Badge className={cn('text-[10px] px-2 py-0', roleColors[user.role])}>
                  {roleLabels[user.role]?.[language] || user.role}
                </Badge>
              </div>
              <Avatar className="h-9 w-9">
                <AvatarImage src={avatarUrl || undefined} alt={user.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {getInitials(user.name || 'U')}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate('/my-profile')}>
              <User className="w-4 h-4 mr-2" />
              {language === 'id' ? 'Profil Saya' : 'My Profile'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              {t('btn.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
