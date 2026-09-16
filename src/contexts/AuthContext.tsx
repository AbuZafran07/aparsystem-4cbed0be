import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

export type UserRole = 'PURCHASING' | 'FINANCE' | 'ADMIN' | 'SUPER_ADMIN' | 'SALES';

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
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user profile and role from database
  const fetchUserData = async (supabaseUser: SupabaseUser): Promise<User | null> => {
    try {
      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', supabaseUser.id)
        .single();

      if (profileError || !profile) {
        console.error('Error fetching profile:', profileError);
        return null;
      }

      // Fetch role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', supabaseUser.id)
        .single();

      if (roleError || !roleData) {
        console.error('Error fetching role:', roleError);
        return null;
      }

      return {
        id: supabaseUser.id,
        email: profile.email,
        role: roleData.role as UserRole,
        name: profile.full_name,
        isActive: profile.is_active,
      };
    } catch (error) {
      console.error('Error in fetchUserData:', error);
      return null;
    }
  };

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state changed:', event);
        
        if (session?.user && mounted) {
          // Defer Supabase calls with setTimeout to prevent deadlock
          setTimeout(async () => {
            const userData = await fetchUserData(session.user);
            if (mounted) {
              if (userData) {
                if (!userData.isActive) {
                  // User is deactivated, sign them out
                  await supabase.auth.signOut();
                  setUser(null);
                } else {
                  setUser(userData);
                }
              } else {
                setUser(null);
              }
              setIsLoading(false);
            }
          }, 0);
        } else if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user && mounted) {
        const userData = await fetchUserData(session.user);
        if (mounted) {
          if (userData && userData.isActive) {
            setUser(userData);
          } else {
            setUser(null);
          }
          setIsLoading(false);
        }
      } else if (mounted) {
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setIsLoading(false);
        return { success: false, error: error.message };
      }

      if (!data.user) {
        setIsLoading(false);
        return { success: false, error: 'Login failed' };
      }

      // The onAuthStateChange will handle setting the user
      return { success: true };
    } catch (error: any) {
      setIsLoading(false);
      return { success: false, error: error.message || 'An error occurred' };
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
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

    // All menu items available in the system
    const allMenuItems = [
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
      'paymentRequests',
      'customerStatus',
      'exportCenter',
      'importExportCenter',
    ];

    // System menu items
    const systemMenuItems = ['auditLogs', 'userManagement', 'systemSettings'];
    const superAdminOnly = ['backupRestore', 'integrationSettings'];

    // Accounting (Finance ERP Phase 1) - FINANCE/ADMIN/SUPER_ADMIN only, per PRD 7.1
    const accountingMenuItems = [
      'chartOfAccounts',
      'fiscalPeriods',
      'accountingRules',
      'journalEntries',
      'generalLedger',
      'trialBalance',
      'financialStatements',
      'taxCodes',
    ];

    // Kas & Bank (core cash/bank module) - FINANCE/ADMIN/SUPER_ADMIN only, matches
    // cash_bank_transactions RLS.
    const cashBankMenuItems = [
      'cashIn',
      'cashOut',
      'cashTransfer',
      'cashBankTransactions',
    ];

    // SALES: view-only access limited to AR-related menus
    const salesMenuItems = [
      'dashboard',
      'accountsReceivable',
      'arAging',
      'arReport',
      'customerStatus',
      'arReceipts',
      'billingLetters',
      'billingEmailLogs',
    ];

    const roleMenuAccess: Record<UserRole, string[]> = {
      PURCHASING: [...allMenuItems, 'auditLogs'],
      FINANCE: [...allMenuItems, 'auditLogs', ...accountingMenuItems, ...cashBankMenuItems],
      ADMIN: [...allMenuItems, ...systemMenuItems, ...accountingMenuItems, ...cashBankMenuItems],
      SUPER_ADMIN: [...allMenuItems, ...systemMenuItems, ...superAdminOnly, ...accountingMenuItems, ...cashBankMenuItems],
      SALES: salesMenuItems,
    };

    return roleMenuAccess[user.role]?.includes(menuKey) ?? false;
  }, [user]);

  return { hasRole, canAccessMenu };
}
