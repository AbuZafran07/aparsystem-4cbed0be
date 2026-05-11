import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeftRight, ReceiptText, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuditConfig } from '@/contexts/AuditConfigContext';

interface Workspace {
  id: string;
  name: string;
  subtitle: string;
  icon: React.ElementType;
  route: string;
}

interface WorkspaceSwitcherProps {
  collapsed?: boolean;
}

export default function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const { year } = useAuditConfig();

  const workspaces: Workspace[] = [
    { id: 'apar',  name: 'AP/AR Hub',              subtitle: 'Finance System', icon: ArrowLeftRight, route: '/dashboard'     },
    { id: 'audit', name: `Audit Cash Out ${year}`, subtitle: 'Audit Module',   icon: ReceiptText,    route: '/audit-cashout' },
  ];

  const active = location.pathname.startsWith('/audit-cashout')
    ? workspaces[1]
    : workspaces[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (ws: Workspace) => {
    navigate(ws.route);
    setOpen(false);
  };

  const ActiveIcon = active.icon;

  return (
    <div ref={ref} className="relative px-3 py-2.5 border-b border-sidebar-border/30">
      <button
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          'w-full flex items-center rounded-lg border border-sidebar-border/40 bg-sidebar-accent/20 hover:bg-sidebar-accent/50 transition-all duration-200',
          collapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-2.5'
        )}
      >
        <div className="flex-shrink-0 w-7 h-7 rounded-md bg-sidebar-accent flex items-center justify-center">
          <ActiveIcon className="w-4 h-4 text-sidebar-foreground" />
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
                {active.name}
              </p>
              <p className="text-[10px] text-sidebar-foreground/50 truncate leading-tight">
                {active.subtitle}
              </p>
            </div>
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-sidebar-foreground/40 transition-transform duration-200 flex-shrink-0',
                open && 'rotate-180'
              )}
            />
          </>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 rounded-lg border border-sidebar-border/40 bg-sidebar shadow-xl overflow-hidden',
            collapsed ? 'left-full ml-2 top-0 w-52' : 'left-3 right-3'
          )}
        >
          {workspaces.map(ws => {
            const Icon = ws.icon;
            const isActive = ws.id === active.id;
            return (
              <button
                key={ws.id}
                onClick={() => handleSelect(ws)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-150',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <div className="flex-shrink-0 w-7 h-7 rounded-md bg-sidebar-accent/60 flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate leading-tight">{ws.name}</p>
                  <p className="text-[10px] text-sidebar-foreground/50 truncate leading-tight">
                    {ws.subtitle}
                  </p>
                </div>
                {isActive && <Check className="w-3.5 h-3.5 flex-shrink-0 text-sidebar-foreground" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
