import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, MoreHorizontal, Upload, FileDown, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { parseExcelFile, validateAndMapVendorData, generateVendorTemplate } from '@/lib/importUtils';
import { TablePagination, usePagination } from '@/components/TablePagination';

type Vendor = Tables<'vendors'>;

export default function VendorsPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formBankName, setFormBankName] = useState('');
  const [formBankAccountNo, setFormBankAccountNo] = useState('');
  const [formActive, setFormActive] = useState(true);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('vendor_name');
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (vendor: Partial<Vendor>) => {
      if (editingVendor) {
        const { error } = await supabase
          .from('vendors')
          .update(vendor)
          .eq('id', editingVendor.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vendors').insert([vendor as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      closeDialog();
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: editingVendor
          ? (language === 'en' ? 'Vendor updated' : 'Vendor diupdate')
          : (language === 'en' ? 'Vendor created' : 'Vendor dibuat'),
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendors').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: language === 'en' ? 'Vendor deleted' : 'Vendor dihapus',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingVendor(null);
    setFormName('');
    setFormAddress('');
    setFormPhone('');
    setFormEmail('');
    setFormBankName('');
    setFormBankAccountNo('');
    setFormActive(true);
    setIsDialogOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormName(vendor.vendor_name);
    setFormAddress(vendor.address || '');
    setFormPhone(vendor.phone || '');
    setFormEmail(vendor.email || '');
    setFormBankName((vendor as any).bank_name || '');
    setFormBankAccountNo((vendor as any).bank_account_no || '');
    setFormActive(vendor.is_active);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingVendor(null);
  };

  const handleSave = () => {
    if (!formName.trim()) {
      toast({ title: 'Error', description: language === 'en' ? 'Name is required' : 'Nama wajib diisi', variant: 'destructive' });
      return;
    }
    saveMutation.mutate({
      vendor_name: formName,
      address: formAddress || null,
      phone: formPhone || null,
      email: formEmail || null,
      bank_name: formBankName || null,
      bank_account_no: formBankAccountNo || null,
      is_active: formActive,
    } as any);
  };

  const handleDelete = (vendor: Vendor) => {
    if (confirm(language === 'en' ? `Delete ${vendor.vendor_name}?` : `Hapus ${vendor.vendor_name}?`)) {
      deleteMutation.mutate(vendor.id);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const rows = await parseExcelFile(file);
      const result = validateAndMapVendorData(rows);
      
      if (result.errors.length > 0) {
        toast({
          title: 'Error',
          description: result.errors.map(err => `Baris ${err.row}: ${err.message}`).join('\n'),
          variant: 'destructive',
        });
      }
      
      if (result.data.length > 0) {
        const { error } = await supabase.from('vendors').upsert(result.data, { onConflict: 'vendor_name' });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['vendors'] });
        toast({
          title: language === 'en' ? 'Success' : 'Berhasil',
          description: language === 'en' 
            ? `${result.data.length} vendors imported successfully` 
            : `${result.data.length} vendor berhasil diimport`,
        });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filtered = vendors.filter(v =>
    v.vendor_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const {
    paginatedItems,
    currentPage,
    pageSize,
    totalItems,
    handlePageChange,
    handlePageSizeChange,
  } = usePagination(filtered);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Vendors' : 'Vendor'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Manage vendor master data' : 'Kelola data master vendor'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button variant="outline" size="sm" onClick={() => generateVendorTemplate()}>
            <FileDown className="w-4 h-4 mr-2" />
            Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Import
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            {language === 'en' ? 'Add Vendor' : 'Tambah Vendor'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={language === 'en' ? 'Search vendors...' : 'Cari vendor...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Name' : 'Nama'}</TableHead>
                <TableHead>{language === 'en' ? 'Address' : 'Alamat'}</TableHead>
                <TableHead>{language === 'en' ? 'Phone' : 'Telepon'}</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : paginatedItems.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No vendors found' : 'Tidak ada vendor'}</TableCell></TableRow>
              ) : (
                paginatedItems.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="font-medium">{vendor.vendor_name}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{vendor.address || '-'}</TableCell>
                    <TableCell>{vendor.phone || '-'}</TableCell>
                    <TableCell>{vendor.email || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={vendor.is_active ? 'default' : 'secondary'}>
                        {vendor.is_active ? (language === 'en' ? 'Active' : 'Aktif') : (language === 'en' ? 'Inactive' : 'Nonaktif')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(vendor)} className="gap-2">
                            <Edit className="w-4 h-4" />{language === 'en' ? 'Edit' : 'Edit'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(vendor)} className="gap-2 text-destructive">
                            <Trash2 className="w-4 h-4" />{language === 'en' ? 'Delete' : 'Hapus'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVendor ? (language === 'en' ? 'Edit Vendor' : 'Edit Vendor') : (language === 'en' ? 'Add Vendor' : 'Tambah Vendor')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Vendor Name' : 'Nama Vendor'} *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Address' : 'Alamat'}</Label>
              <Textarea value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Phone' : 'Telepon'}</Label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Bank Name' : 'Nama Bank'}</Label>
                <Input value={formBankName} onChange={(e) => setFormBankName(e.target.value)} placeholder="e.g., Bank Mandiri" />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Bank Account No' : 'No. Rekening'}</Label>
                <Input value={formBankAccountNo} onChange={(e) => setFormBankAccountNo(e.target.value)} placeholder="e.g., 1234567890" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formActive} onCheckedChange={setFormActive} />
              <Label>{language === 'en' ? 'Active' : 'Aktif'}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>{language === 'en' ? 'Cancel' : 'Batal'}</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (language === 'en' ? 'Saving...' : 'Menyimpan...') : (language === 'en' ? 'Save' : 'Simpan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
