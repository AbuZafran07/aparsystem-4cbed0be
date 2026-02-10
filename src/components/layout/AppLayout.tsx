import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import AppTopbar from './AppTopbar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

interface AppLayoutProps {
  pageTitle?: string;
}

export default function AppLayout({ pageTitle }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      {!isMobile && (
        <div className="fixed left-0 top-0 bottom-0 w-[260px] z-50">
          <AppSidebar />
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

      <div className={isMobile ? 'min-h-screen flex flex-col' : 'ml-[260px] min-h-screen flex flex-col'}>
        <AppTopbar pageTitle={pageTitle} onMenuToggle={() => setSidebarOpen(true)} />
        <main className="flex-1 p-3 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
