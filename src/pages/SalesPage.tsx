import React, { useState, useEffect } from 'react';
import { TablePagination, usePagination } from '@/components/TablePagination';
import { Plus, Search, Edit, Trash2, Loader2, MoreHorizontal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Sales {
  id: string;
  sales_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export default function SalesPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [salesList, setSalesList] = useState<Sales[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSales, setSelectedSales] = useState<Sales | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    sales_name: '',
    email: '',
    phone: '',
    is_active: true,
  });

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .order('sales_name');

      if (error) throw error;
      setSalesList(data || []);
    } catch (error: any) {
      console.error('Error fetching sales:', error);
      toast.error(language === 'en' ? 'Failed to load sales' : 'Gagal memuat data sales');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setSelectedSales(null);
    setFormData({
      sales_name: '',
      email: '',
      phone: '',
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (sales: Sales) => {
    setSelectedSales(sales);
    setFormData({
      sales_name: sales.sales_name,
      email: sales.email || '',
      phone: sales.phone || '',
      is_active: sales.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.sales_name.trim()) {
      toast.error(language === 'en' ? 'Sales name is required' : 'Nama sales wajib diisi');
      return;
    }

    try {
      setSaving(true);

      if (selectedSales) {
        const { error } = await supabase
          .from('sales')
          .update({
            sales_name: formData.sales_name,
            email: formData.email || null,
            phone: formData.phone || null,
            is_active: formData.is_active,
          })
          .eq('id', selectedSales.id);

        if (error) throw error;
        toast.success(language === 'en' ? 'Sales updated successfully' : 'Sales berhasil diperbarui');
      } else {
        const { error } = await supabase
          .from('sales')
          .insert([{
            sales_name: formData.sales_name,
            email: formData.email || null,
            phone: formData.phone || null,
            is_active: formData.is_active,
          }]);

        if (error) throw error;
        toast.success(language === 'en' ? 'Sales created successfully' : 'Sales berhasil dibuat');
      }

      setIsDialogOpen(false);
      fetchSales();
    } catch (error: any) {
      console.error('Error saving sales:', error);
      toast.error(error.message || (language === 'en' ? 'Failed to save sales' : 'Gagal menyimpan sales'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSales) return;

    try {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', selectedSales.id);

      if (error) throw error;
      toast.success(language === 'en' ? 'Sales deleted' : 'Sales dihapus');
      setIsDeleteDialogOpen(false);
      setSelectedSales(null);
      fetchSales();
    } catch (error: any) {
      console.error('Error deleting sales:', error);
      toast.error(language === 'en' ? 'Failed to delete sales' : 'Gagal menghapus sales');
    }
  };

  const filteredSales = salesList.filter(
    (s) =>
      s.sales_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.email && s.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const {
    paginatedItems,
    currentPage,
    pageSize,
    totalItems,
    handlePageChange,
    handlePageSizeChange,
  } = usePagination(filteredSales);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Sales Master Data' : 'Data Master Sales'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Manage sales personnel data' : 'Kelola data personel sales'}
          </p>
        </div>
        {isAdmin && (
          <Button className="gap-2" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4" />
            {language === 'en' ? 'Add Sales' : 'Tambah Sales'}
          </Button>
        )}
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={language === 'en' ? 'Search sales...' : 'Cari sales...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Sales Name' : 'Nama Sales'}</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>{language === 'en' ? 'Phone' : 'Telepon'}</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="w-[80px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {language === 'en' ? 'No sales found' : 'Tidak ada sales ditemukan'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((sales) => (
                  <TableRow key={sales.id}>
                    <TableCell className="font-medium">{sales.sales_name}</TableCell>
                    <TableCell>{sales.email || '-'}</TableCell>
                    <TableCell>{sales.phone || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={sales.is_active ? 'default' : 'secondary'}>
                        {sales.is_active 
                          ? (language === 'en' ? 'Active' : 'Aktif')
                          : (language === 'en' ? 'Inactive' : 'Nonaktif')}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenEdit(sales)}>
                              <Edit className="w-4 h-4 mr-2" />
                              {language === 'en' ? 'Edit' : 'Ubah'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setSelectedSales(sales);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {language === 'en' ? 'Delete' : 'Hapus'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
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

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedSales
                ? (language === 'en' ? 'Edit Sales' : 'Ubah Sales')
                : (language === 'en' ? 'Add New Sales' : 'Tambah Sales Baru')}
            </DialogTitle>
            <DialogDescription>
              {language === 'en'
                ? 'Fill in the sales details below'
                : 'Isi detail sales di bawah ini'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Sales Name' : 'Nama Sales'} *</Label>
              <Input
                value={formData.sales_name}
                onChange={(e) => setFormData({ ...formData, sales_name: e.target.value })}
                placeholder={language === 'en' ? 'Enter sales name' : 'Masukkan nama sales'}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder={language === 'en' ? 'Enter email' : 'Masukkan email'}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Phone' : 'Telepon'}</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder={language === 'en' ? 'Enter phone number' : 'Masukkan nomor telepon'}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>{language === 'en' ? 'Active Status' : 'Status Aktif'}</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {language === 'en' ? 'Cancel' : 'Batal'}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Save' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'en' ? 'Delete Sales' : 'Hapus Sales'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en'
                ? `Are you sure you want to delete "${selectedSales?.sales_name}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin menghapus "${selectedSales?.sales_name}"? Tindakan ini tidak dapat dibatalkan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'en' ? 'Cancel' : 'Batal'}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {language === 'en' ? 'Delete' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
