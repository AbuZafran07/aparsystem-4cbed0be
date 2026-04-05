import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import AppTopbar from './AppTopbar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  pageTitle?: string;
}

export default function AppLayout({ pageTitle }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      {!isMobile && (
        <div
          className={cn(
            'fixed left-0 top-0 bottom-0 z-50 transition-all duration-300 ease-in-out',
            collapsed ? 'w-[68px]' : 'w-[260px]'
          )}
        >
          <AppSidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
        </div>
      )}

      {/* Mobile sidebar as sheet */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="p-0 w-[280px] bg-sidebar border-none">
            <AppSidebar onNavigate={() => setSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      <div
        className={cn(
          'min-h-screen flex flex-col transition-all duration-300 ease-in-out',
          isMobile ? '' : collapsed ? 'ml-[68px]' : 'ml-[260px]'
        )}
      >
        <AppTopbar pageTitle={pageTitle} onMenuToggle={() => setSidebarOpen(true)} />
        <main className="flex-1 p-3 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
