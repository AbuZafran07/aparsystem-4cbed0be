import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export type UserRole = 'PURCHASING' | 'FINANCE' | 'ADMIN' | 'SUPER_ADMIN';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  isActive: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock users for demo (in production, this would be from Supabase)
const MOCK_USERS: { email: string; password: string; user: User }[] = [
  {
    email: 'ferry@kemika.co.id',
    password: 'Ksatria2312',
    user: {
      id: '1',
      email: 'ferry@kemika.co.id',
      role: 'SUPER_ADMIN',
      name: 'Ferry Kemika',
      isActive: true,
    },
  },
  {
    email: 'finance@kemika.co.id',
    password: 'finance123',
    user: {
      id: '2',
      email: 'finance@kemika.co.id',
      role: 'FINANCE',
      name: 'Finance Team',
      isActive: true,
    },
  },
  {
    email: 'purchasing@kemika.co.id',
    password: 'purchasing123',
    user: {
      id: '3',
      email: 'purchasing@kemika.co.id',
      role: 'PURCHASING',
      name: 'Purchasing Team',
      isActive: true,
    },
  },
  {
    email: 'admin@kemika.co.id',
    password: 'admin123',
    user: {
      id: '4',
      email: 'admin@kemika.co.id',
      role: 'ADMIN',
      name: 'Admin Team',
      isActive: true,
    },
  },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('apar_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('apar_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const foundUser = MOCK_USERS.find(
      u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );

    if (foundUser) {
      if (!foundUser.user.isActive) {
        setIsLoading(false);
        return { success: false, error: 'Account is deactivated. Please contact Super Admin.' };
      }
      
      setUser(foundUser.user);
      localStorage.setItem('apar_user', JSON.stringify(foundUser.user));
      setIsLoading(false);
      return { success: true };
    }

    setIsLoading(false);
    return { success: false, error: 'Invalid email or password' };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('apar_user');
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Role-based access control helper
export function useRoleAccess() {
  const { user } = useAuth();

  const hasRole = useCallback((roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  }, [user]);

  const canAccessMenu = useCallback((menuKey: string): boolean => {
    if (!user) return false;

    const roleMenuAccess: Record<UserRole, string[]> = {
      PURCHASING: [
        'dashboard',
        'accountsPayable',
      ],
      FINANCE: [
        'dashboard',
        'accountsPayable',
        'accountsReceivable',
        'apPayments',
        'arReceipts',
        'billingLetters',
        'billingEmailLogs',
        'apAging',
        'arAging',
        'apReport',
        'arReport',
        'cashflow',
        'exportCenter',
        'importExportCenter',
        'auditLogs',
      ],
      ADMIN: [
        'dashboard',
        'vendors',
        'customers',
        'sales',
        'paymentTerms',
        'bankAccounts',
        'companyProfile',
        'importExportCenter',
        'auditLogs',
      ],
      SUPER_ADMIN: [
        'dashboard',
        'accountsPayable',
        'accountsReceivable',
        'apPayments',
        'arReceipts',
        'billingLetters',
        'billingEmailLogs',
        'vendors',
        'customers',
        'sales',
        'paymentTerms',
        'bankAccounts',
        'companyProfile',
        'apAging',
        'arAging',
        'apReport',
        'arReport',
        'cashflow',
        'exportCenter',
        'importExportCenter',
        'auditLogs',
        'userManagement',
        'systemSettings',
      ],
    };

    return roleMenuAccess[user.role]?.includes(menuKey) ?? false;
  }, [user]);

  return { hasRole, canAccessMenu };
}
