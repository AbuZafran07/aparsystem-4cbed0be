import React, { useState } from 'react';
import { Plus, Search, Filter, Eye, Edit, Trash2, Check, X, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

type InvoiceStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PARTIAL' | 'PAID';

interface ApInvoice {
  id: string;
  vendor_name: string;
  vendor_invoice_number: string;
  po_number: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  overdue_days: number;
  status: InvoiceStatus;
}

// Mock data
const mockApInvoices: ApInvoice[] = [
  {
    id: '1',
    vendor_name: 'PT. Supplier Utama',
    vendor_invoice_number: 'INV-2026-001',
    po_number: 'PO-2026-001',
    invoice_date: '2025-12-15',
    due_date: '2026-01-15',
    invoice_amount: 125000000,
    paid_amount: 0,
    outstanding_amount: 125000000,
    overdue_days: 0,
    status: 'APPROVED',
  },
  {
    id: '2',
    vendor_name: 'CV. Material Jaya',
    vendor_invoice_number: 'INV-2026-002',
    po_number: 'PO-2026-002',
    invoice_date: '2025-12-10',
    due_date: '2025-12-25',
    invoice_amount: 75000000,
    paid_amount: 50000000,
    outstanding_amount: 25000000,
    overdue_days: 8,
    status: 'PARTIAL',
  },
  {
    id: '3',
    vendor_name: 'PT. Bahan Kimia',
    vendor_invoice_number: 'INV-2026-003',
    po_number: 'PO-2026-003',
    invoice_date: '2025-12-20',
    due_date: '2026-01-20',
    invoice_amount: 95000000,
    paid_amount: 0,
    outstanding_amount: 95000000,
    overdue_days: 0,
    status: 'SUBMITTED',
  },
  {
    id: '4',
    vendor_name: 'PT. Logistik Prima',
    vendor_invoice_number: 'INV-2026-004',
    po_number: 'PO-2026-004',
    invoice_date: '2025-12-18',
    due_date: '2026-01-18',
    invoice_amount: 45000000,
    paid_amount: 0,
    outstanding_amount: 45000000,
    overdue_days: 0,
    status: 'DRAFT',
  },
  {
    id: '5',
    vendor_name: 'PT. Packaging Indo',
    vendor_invoice_number: 'INV-2026-005',
    po_number: 'PO-2026-005',
    invoice_date: '2025-11-15',
    due_date: '2025-12-15',
    invoice_amount: 60000000,
    paid_amount: 60000000,
    outstanding_amount: 0,
    overdue_days: 0,
    status: 'PAID',
  },
];

const statusConfig: Record<InvoiceStatus, { label: { en: string; id: string }; className: string }> = {
  DRAFT: { label: { en: 'Draft', id: 'Draft' }, className: 'badge-draft' },
  SUBMITTED: { label: { en: 'Submitted', id: 'Diajukan' }, className: 'badge-submitted' },
  APPROVED: { label: { en: 'Approved', id: 'Disetujui' }, className: 'badge-approved' },
  REJECTED: { label: { en: 'Rejected', id: 'Ditolak' }, className: 'badge-rejected' },
  PARTIAL: { label: { en: 'Partial', id: 'Sebagian' }, className: 'badge-partial' },
  PAID: { label: { en: 'Paid', id: 'Lunas' }, className: 'badge-paid' },
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function ApListPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const isPurchasing = user?.role === 'PURCHASING';
  const isFinance = user?.role === 'FINANCE' || user?.role === 'SUPER_ADMIN';

  const filteredInvoices = mockApInvoices.filter(
    (inv) =>
      inv.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.vendor_invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.po_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canEdit = (status: InvoiceStatus) => {
    if (isPurchasing) {
      return status === 'DRAFT' || status === 'REJECTED';
    }
    return false;
  };

  const canSubmit = (status: InvoiceStatus) => {
    return isPurchasing && status === 'DRAFT';
  };

  const canApprove = (status: InvoiceStatus) => {
    return isFinance && status === 'SUBMITTED';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('menu.accountsPayable')}</h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' 
              ? 'Manage vendor invoices and payments' 
              : 'Kelola invoice dan pembayaran vendor'}
          </p>
        </div>
        {isPurchasing && (
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            {t('btn.newApInvoice')}
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('common.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              {t('common.filter')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.vendorName')}</TableHead>
                <TableHead>{t('table.invoiceNumber')}</TableHead>
                <TableHead>{t('table.invoiceDate')}</TableHead>
                <TableHead>{t('table.dueDate')}</TableHead>
                <TableHead className="text-right">{t('table.invoiceAmount')}</TableHead>
                <TableHead className="text-right">{t('table.outstanding')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead className="w-[100px]">{t('table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.vendor_name}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{invoice.vendor_invoice_number}</p>
                        <p className="text-xs text-muted-foreground">{invoice.po_number}</p>
                      </div>
                    </TableCell>
                    <TableCell>{invoice.invoice_date}</TableCell>
                    <TableCell>
                      <div>
                        <p>{invoice.due_date}</p>
                        {invoice.overdue_days > 0 && (
                          <p className="text-xs text-danger">
                            {invoice.overdue_days} {language === 'en' ? 'days overdue' : 'hari terlambat'}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(invoice.invoice_amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn(invoice.outstanding_amount > 0 && 'text-warning font-medium')}>
                        {formatCurrency(invoice.outstanding_amount)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('text-xs', statusConfig[invoice.status].className)}>
                        {statusConfig[invoice.status].label[language]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="gap-2">
                            <Eye className="w-4 h-4" />
                            {t('btn.view')}
                          </DropdownMenuItem>
                          {canEdit(invoice.status) && (
                            <DropdownMenuItem className="gap-2">
                              <Edit className="w-4 h-4" />
                              {t('btn.edit')}
                            </DropdownMenuItem>
                          )}
                          {canSubmit(invoice.status) && (
                            <DropdownMenuItem className="gap-2">
                              <Check className="w-4 h-4" />
                              {t('btn.submit')}
                            </DropdownMenuItem>
                          )}
                          {canApprove(invoice.status) && (
                            <>
                              <DropdownMenuItem className="gap-2 text-success">
                                <Check className="w-4 h-4" />
                                {t('btn.approve')}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-danger">
                                <X className="w-4 h-4" />
                                {t('btn.reject')}
                              </DropdownMenuItem>
                            </>
                          )}
                          {isFinance && invoice.status === 'APPROVED' && (
                            <DropdownMenuItem className="gap-2">
                              <Plus className="w-4 h-4" />
                              {t('btn.recordPayment')}
                            </DropdownMenuItem>
                          )}
                          {canEdit(invoice.status) && (
                            <DropdownMenuItem className="gap-2 text-danger">
                              <Trash2 className="w-4 h-4" />
                              {t('btn.delete')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
