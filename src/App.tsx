import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ApListPage from "@/pages/ApListPage";
import ArListPage from "@/pages/ArListPage";
import PlaceholderPage from "@/pages/PlaceholderPage";
import UserManagementPage from "@/pages/UserManagementPage";
import VendorsPage from "@/pages/VendorsPage";
import CustomersPage from "@/pages/CustomersPage";
import PaymentTermsPage from "@/pages/PaymentTermsPage";
import BankAccountsPage from "@/pages/BankAccountsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              
              {/* Protected Routes with App Layout */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<DashboardPage />} />
                
                {/* Transactions */}
                <Route path="/ap" element={<ApListPage />} />
                <Route path="/ar" element={<ArListPage />} />
                <Route path="/ap-payments" element={<PlaceholderPage titleKey="menu.apPayments" />} />
                <Route path="/ar-receipts" element={<PlaceholderPage titleKey="menu.arReceipts" />} />
                
                {/* Billing */}
                <Route path="/billing-letters" element={<PlaceholderPage titleKey="menu.billingLetters" />} />
                <Route path="/billing-email-logs" element={<PlaceholderPage titleKey="menu.billingEmailLogs" />} />
                
                {/* Master Data */}
                <Route path="/vendors" element={<VendorsPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/sales" element={<PlaceholderPage titleKey="menu.sales" />} />
                <Route path="/payment-terms" element={<PaymentTermsPage />} />
                <Route path="/bank-accounts" element={<BankAccountsPage />} />
                <Route path="/company-profile" element={<PlaceholderPage titleKey="menu.companyProfile" />} />
                
                {/* Reports */}
                <Route path="/ap-aging" element={<PlaceholderPage titleKey="menu.apAging" />} />
                <Route path="/ar-aging" element={<PlaceholderPage titleKey="menu.arAging" />} />
                <Route path="/ap-report" element={<PlaceholderPage titleKey="menu.apReport" />} />
                <Route path="/ar-report" element={<PlaceholderPage titleKey="menu.arReport" />} />
                <Route path="/cashflow" element={<PlaceholderPage titleKey="menu.cashflow" />} />
                <Route path="/export-center" element={<PlaceholderPage titleKey="menu.exportCenter" />} />
                <Route path="/import-export" element={<PlaceholderPage titleKey="menu.importExportCenter" />} />
                
                {/* System */}
                <Route path="/audit-logs" element={<PlaceholderPage titleKey="menu.auditLogs" />} />
                <Route path="/users" element={<UserManagementPage />} />
                <Route path="/settings" element={<PlaceholderPage titleKey="menu.systemSettings" />} />
              </Route>

              {/* Redirects */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              
              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
