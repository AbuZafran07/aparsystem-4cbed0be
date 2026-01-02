import React from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import AppTopbar from './AppTopbar';

interface AppLayoutProps {
  pageTitle?: string;
}

export default function AppLayout({ pageTitle }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="ml-[260px] min-h-screen flex flex-col">
        <AppTopbar pageTitle={pageTitle} />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
