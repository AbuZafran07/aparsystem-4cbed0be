import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, FileSpreadsheet, RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TablePagination, usePagination } from '@/components/TablePagination';
import { exportToExcel, exportToPDF, ExportColumn, formatCurrencyForExport, formatDateForExport } from '@/lib/exportUtils';
import type { Tables } from '@/integrations/supabase/types';

type FixedAsset = Tables<'fixed_assets'>;

const statusConfig: Record<string, { en: string; id: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ACTIVE: { en: 'Active', id: 'Aktif', variant: 'default' },
  FULLY_DEPRECIATED: { en: 'Fully Depreciated', id: 'Penyusutan Penuh', variant: 'secondary' },
  DISPOSED: { en: 'Disposed', id: 'Dilepas', variant: 'destructive' },
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export default function FixedAssetReportPage() {
  const { language } = useLanguage();

  const { data: assets = [], isLoading, refetch } = useQuery({
    queryKey: ['fixed_assets', 'report'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_assets').select('*').order('category').order('asset_code');
      if (error) throw error;
      return data as FixedAsset[];
    },
  });

  const monthlyDepreciation = (asset: FixedAsset) =>
    asset.useful_life_months > 0 ? (asset.acquisition_cost - asset.salvage_value) / asset.useful_life_months : 0;

  const netBookValue = (asset: FixedAsset) => asset.acquisition_cost - asset.accumulated_depreciation;

  const assetRows = useMemo(() => assets.map(a => ({
    asset_code: a.asset_code,
    name: a.name,
    category: a.category || (language === 'en' ? 'Uncategorized' : 'Tanpa Kategori'),
    acquisition_date: a.acquisition_date,
    acquisition_cost: a.acquisition_cost,
    accumulated_depreciation: a.accumulated_depreciation,
    book_value: netBookValue(a),
    monthly_depreciation: monthlyDepreciation(a),
    status: a.status,
  })), [assets, language]);

  const {
    paginatedItems: paginatedAssetRows,
    currentPage,
    pageSize,
    totalItems,
    handlePageChange,
    handlePageSizeChange,
  } = usePagination(assetRows, 25);

  const categoryRows = useMemo(() => {
    const map = new Map<string, { category: string; acquisition_cost: number; monthly_depreciation: number; accumulated_depreciation: number; book_value: number; count: number }>();
    assetRows.forEach(r => {
      const existing = map.get(r.category) || { category: r.category, acquisition_cost: 0, monthly_depreciation: 0, accumulated_depreciation: 0, book_value: 0, count: 0 };
      existing.acquisition_cost += r.acquisition_cost;
      existing.monthly_depreciation += r.monthly_depreciation;
      existing.accumulated_depreciation += r.accumulated_depreciation;
      existing.book_value += r.book_value;
      existing.count += 1;
      map.set(r.category, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category));
  }, [assetRows]);

  const grandTotal = categoryRows.reduce((acc, r) => ({
    acquisition_cost: acc.acquisition_cost + r.acquisition_cost,
    monthly_depreciation: acc.monthly_depreciation + r.monthly_depreciation,
    accumulated_depreciation: acc.accumulated_depreciation + r.accumulated_depreciation,
    book_value: acc.book_value + r.book_value,
  }), { acquisition_cost: 0, monthly_depreciation: 0, accumulated_depreciation: 0, book_value: 0 });

  const getAssetExportColumns = (): ExportColumn[] => [
    { key: 'asset_code', header: language === 'en' ? 'Code' : 'Kode' },
    { key: 'name', header: language === 'en' ? 'Name' : 'Nama' },
    { key: 'category', header: language === 'en' ? 'Category' : 'Kategori' },
    { key: 'acquisition_date', header: language === 'en' ? 'Acquisition Date' : 'Tanggal Perolehan', format: formatDateForExport },
    { key: 'acquisition_cost', header: language === 'en' ? 'Acquisition Cost' : 'Nilai Perolehan', format: formatCurrencyForExport },
    { key: 'accumulated_depreciation', header: language === 'en' ? 'Accum. Depreciation' : 'Akumulasi Penyusutan', format: formatCurrencyForExport },
    { key: 'book_value', header: language === 'en' ? 'Book Value' : 'Nilai Buku', format: formatCurrencyForExport },
    { key: 'monthly_depreciation', header: language === 'en' ? 'Deprec./Month' : 'Peny./Bulan', format: formatCurrencyForExport },
    { key: 'status', header: 'Status' },
  ];

  const getCategoryExportColumns = (): ExportColumn[] => [
    { key: 'category', header: language === 'en' ? 'Category' : 'Kategori' },
    { key: 'count', header: language === 'en' ? 'Asset Count' : 'Jumlah Aset' },
    { key: 'acquisition_cost', header: language === 'en' ? 'Acquisition Cost' : 'Nilai Perolehan', format: formatCurrencyForExport },
    { key: 'monthly_depreciation', header: language === 'en' ? 'Deprec./Month' : 'Peny./Bulan', format: formatCurrencyForExport },
    { key: 'accumulated_depreciation', header: language === 'en' ? 'Accum. Depreciation' : 'Akumulasi Penyusutan', format: formatCurrencyForExport },
    { key: 'book_value', header: language === 'en' ? 'Book Value' : 'Nilai Buku', format: formatCurrencyForExport },
  ];

  const handleExportAssets = (format: 'excel' | 'pdf') => {
    const columns = getAssetExportColumns();
    const filename = `Daftar_Harta_Tetap_${new Date().toISOString().split('T')[0]}`;
    if (format === 'pdf') {
      exportToPDF(assetRows, columns, filename, language === 'en' ? 'Fixed Asset Register' : 'Daftar Harta Tetap');
    } else {
      exportToExcel(assetRows, columns, filename);
    }
    toast.success(language === 'en' ? 'Report exported' : 'Laporan diekspor');
  };

  const handleExportCategory = (format: 'excel' | 'pdf') => {
    const columns = getCategoryExportColumns();
    const filename = `Analisa_Penyusutan_Kategori_${new Date().toISOString().split('T')[0]}`;
    if (format === 'pdf') {
      exportToPDF(categoryRows, columns, filename, language === 'en' ? 'Depreciation Analysis by Category' : 'Analisa Penyusutan per Kategori');
    } else {
      exportToExcel(categoryRows, columns, filename);
    }
    toast.success(language === 'en' ? 'Report exported' : 'Laporan diekspor');
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Fixed Asset Report' : 'Laporan Harta Tetap'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Asset register and depreciation analysis by category' : 'Daftar harta tetap dan analisa penyusutan per kategori'}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Acquisition Cost' : 'Total Nilai Perolehan'}</p>
            <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(grandTotal.acquisition_cost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Deprec./Month' : 'Total Peny./Bulan'}</p>
            <p className="text-xl font-bold text-primary mt-1">{formatCurrency(grandTotal.monthly_depreciation)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Accum. Depreciation' : 'Total Akumulasi Penyusutan'}</p>
            <p className="text-xl font-bold text-warning mt-1">{formatCurrency(grandTotal.accumulated_depreciation)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Book Value' : 'Total Nilai Buku'}</p>
            <p className="text-xl font-bold text-success mt-1">{formatCurrency(grandTotal.book_value)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">{language === 'en' ? 'Depreciation Analysis by Category' : 'Analisa Penyusutan per Kategori'}</CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />{language === 'en' ? 'Export' : 'Ekspor'}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExportCategory('excel')}><FileSpreadsheet className="w-4 h-4 mr-2" />Export Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportCategory('pdf')}><FileText className="w-4 h-4 mr-2" />Export PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Category' : 'Kategori'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Assets' : 'Jml Aset'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Acquisition Cost' : 'Nilai Perolehan'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Deprec./Month' : 'Peny./Bulan'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Accum. Deprec.' : 'Akumulasi'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Book Value' : 'Nilai Buku'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryRows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No data found' : 'Tidak ada data'}</TableCell></TableRow>
              ) : (
                <>
                  {categoryRows.map((r) => (
                    <TableRow key={r.category}>
                      <TableCell className="font-medium">{r.category}</TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.acquisition_cost)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.monthly_depreciation)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.accumulated_depreciation)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(r.book_value)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell className="text-right">{formatCurrency(grandTotal.acquisition_cost)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(grandTotal.monthly_depreciation)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(grandTotal.accumulated_depreciation)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(grandTotal.book_value)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">{language === 'en' ? 'Fixed Asset Register' : 'Daftar Harta Tetap'}</CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />{language === 'en' ? 'Export' : 'Ekspor'}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExportAssets('excel')}><FileSpreadsheet className="w-4 h-4 mr-2" />Export Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportAssets('pdf')}><FileText className="w-4 h-4 mr-2" />Export PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Code' : 'Kode'}</TableHead>
                <TableHead>{language === 'en' ? 'Name' : 'Nama'}</TableHead>
                <TableHead>{language === 'en' ? 'Category' : 'Kategori'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Acquisition Cost' : 'Nilai Perolehan'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Accum. Deprec.' : 'Akumulasi'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Book Value' : 'Nilai Buku'}</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetRows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No data found' : 'Tidak ada data'}</TableCell></TableRow>
              ) : (
                paginatedAssetRows.map((r) => (
                  <TableRow key={r.asset_code}>
                    <TableCell className="font-mono font-medium">{r.asset_code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.category}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.acquisition_cost)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.accumulated_depreciation)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(r.book_value)}</TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[r.status]?.variant || 'secondary'}>
                        {statusConfig[r.status]?.[language] || r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
