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
import { parseExcelFile, validateAndMapCustomerData, generateCustomerTemplate } from '@/lib/importUtils';

type Customer = Tables<'customers'>;

export default function CustomersPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formBillingEmail, setFormBillingEmail] = useState('');
  const [formActive, setFormActive] = useState(true);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('customer_name');
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (customer: Partial<Customer>) => {
      if (editingCustomer) {
        const { error } = await supabase.from('customers').update(customer).eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('customers').insert([customer as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      closeDialog();
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: editingCustomer
          ? (language === 'en' ? 'Customer updated' : 'Customer diupdate')
          : (language === 'en' ? 'Customer created' : 'Customer dibuat'),
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: language === 'en' ? 'Customer deleted' : 'Customer dihapus',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormAddress('');
    setFormPhone('');
    setFormBillingEmail('');
    setFormActive(true);
    setIsDialogOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormName(customer.customer_name);
    setFormAddress(customer.address || '');
    setFormPhone(customer.phone || '');
    setFormBillingEmail(customer.billing_email || '');
    setFormActive(customer.is_active);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingCustomer(null);
  };

  const handleSave = () => {
    if (!formName.trim()) {
      toast({ title: 'Error', description: language === 'en' ? 'Name is required' : 'Nama wajib diisi', variant: 'destructive' });
      return;
    }
    saveMutation.mutate({
      customer_name: formName,
      address: formAddress || null,
      phone: formPhone || null,
      billing_email: formBillingEmail || null,
      is_active: formActive,
    });
  };

  const handleDelete = (customer: Customer) => {
    if (confirm(language === 'en' ? `Delete ${customer.customer_name}?` : `Hapus ${customer.customer_name}?`)) {
      deleteMutation.mutate(customer.id);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const rows = await parseExcelFile(file);
      const result = validateAndMapCustomerData(rows);
      
      if (result.errors.length > 0) {
        toast({
          title: 'Error',
          description: result.errors.map(err => `Baris ${err.row}: ${err.message}`).join('\n'),
          variant: 'destructive',
        });
      }
      
      if (result.data.length > 0) {
        const { error } = await supabase.from('customers').upsert(result.data, { onConflict: 'customer_name' });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        toast({
          title: language === 'en' ? 'Success' : 'Berhasil',
          description: language === 'en' 
            ? `${result.data.length} customers imported successfully` 
            : `${result.data.length} customer berhasil diimport`,
        });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filtered = customers.filter(c =>
    c.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Customers' : 'Pelanggan'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Manage customer master data' : 'Kelola data master pelanggan'}
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
          <Button variant="outline" size="sm" onClick={() => generateCustomerTemplate()}>
            <FileDown className="w-4 h-4 mr-2" />
            Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Import
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            {language === 'en' ? 'Add Customer' : 'Tambah Pelanggan'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={language === 'en' ? 'Search customers...' : 'Cari pelanggan...'}
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
                <TableHead>{language === 'en' ? 'Billing Email' : 'Email Penagihan'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No customers found' : 'Tidak ada pelanggan'}</TableCell></TableRow>
              ) : (
                filtered.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.customer_name}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{customer.address || '-'}</TableCell>
                    <TableCell>{customer.phone || '-'}</TableCell>
                    <TableCell>{customer.billing_email || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={customer.is_active ? 'default' : 'secondary'}>
                        {customer.is_active ? (language === 'en' ? 'Active' : 'Aktif') : (language === 'en' ? 'Inactive' : 'Nonaktif')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(customer)} className="gap-2">
                            <Edit className="w-4 h-4" />{language === 'en' ? 'Edit' : 'Edit'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(customer)} className="gap-2 text-destructive">
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
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCustomer ? (language === 'en' ? 'Edit Customer' : 'Edit Pelanggan') : (language === 'en' ? 'Add Customer' : 'Tambah Pelanggan')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Customer Name' : 'Nama Pelanggan'} *</Label>
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
                <Label>{language === 'en' ? 'Billing Email' : 'Email Penagihan'}</Label>
                <Input type="email" value={formBillingEmail} onChange={(e) => setFormBillingEmail(e.target.value)} />
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