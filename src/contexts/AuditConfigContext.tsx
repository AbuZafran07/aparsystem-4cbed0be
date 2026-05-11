import React, { createContext, useContext, useState } from 'react';

interface AuditConfig {
  year: number;
  setYear: (y: number) => void;
}

const AuditConfigContext = createContext<AuditConfig>({ year: 2026, setYear: () => {} });

export function AuditConfigProvider({ children }: { children: React.ReactNode }) {
  const [year, setYearState] = useState<number>(() => {
    const stored = localStorage.getItem('audit_active_year');
    const n = stored ? parseInt(stored, 10) : 0;
    return n >= 2020 && n <= 2099 ? n : 2026;
  });

  const setYear = (y: number) => {
    localStorage.setItem('audit_active_year', String(y));
    setYearState(y);
  };

  return (
    <AuditConfigContext.Provider value={{ year, setYear }}>
      {children}
    </AuditConfigContext.Provider>
  );
}

export const useAuditConfig = () => useContext(AuditConfigContext);
