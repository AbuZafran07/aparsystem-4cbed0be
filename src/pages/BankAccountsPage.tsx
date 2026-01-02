import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, MoreHorizontal } from 'lucide-react';
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
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type BankAccount = Tables<'bank_accounts'>;

export default function BankAccountsPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  
  const [formBankName, setFormBankName] = useState('');
  const [formAccountNo, setFormAccountNo] = useState('');
  const [formAccountName, setFormAccountName] = useState('');
  const [formActive, setFormActive] = useState(true);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('bank_name');
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (account: Partial<BankAccount>) => {
      if (editingAccount) {
        const { error } = await supabase.from('bank_accounts').update(account).eq('id', editingAccount.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bank_accounts').insert([account as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      closeDialog();
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: editingAccount
          ? (language === 'en' ? 'Bank account updated' : 'Rekening bank diupdate')
          : (language === 'en' ? 'Bank account created' : 'Rekening bank dibuat'),
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: language === 'en' ? 'Bank account deleted' : 'Rekening bank dihapus',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingAccount(null);
    setFormBankName('');
    setFormAccountNo('');
    setFormAccountName('');
    setFormActive(true);
    setIsDialogOpen(true);
  };

  const openEdit = (account: BankAccount) => {
    setEditingAccount(account);
    setFormBankName(account.bank_name);
    setFormAccountNo(account.account_no);
    setFormAccountName(account.account_name);
    setFormActive(account.is_active);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingAccount(null);
  };

  const handleSave = () => {
    if (!formBankName.trim() || !formAccountNo.trim() || !formAccountName.trim()) {
      toast({ title: 'Error', description: language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib', variant: 'destructive' });
      return;
    }
    saveMutation.mutate({
      bank_name: formBankName,
      account_no: formAccountNo,
      account_name: formAccountName,
      is_active: formActive,
    });
  };

  const handleDelete = (account: BankAccount) => {
    if (confirm(language === 'en' ? `Delete ${account.bank_name} - ${account.account_no}?` : `Hapus ${account.bank_name} - ${account.account_no}?`)) {
      deleteMutation.mutate(account.id);
    }
  };

  const filtered = accounts.filter(a =>
    a.bank_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.account_no.includes(searchQuery) ||
    a.account_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Bank Accounts' : 'Rekening Bank'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Manage bank accounts' : 'Kelola rekening bank'}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          {language === 'en' ? 'Add Account' : 'Tambah Rekening'}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={language === 'en' ? 'Search...' : 'Cari...'}
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
                <TableHead>{language === 'en' ? 'Bank Name' : 'Nama Bank'}</TableHead>
                <TableHead>{language === 'en' ? 'Account No' : 'No Rekening'}</TableHead>
                <TableHead>{language === 'en' ? 'Account Name' : 'Nama Rekening'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No bank accounts found' : 'Tidak ada rekening bank'}</TableCell></TableRow>
              ) : (
                filtered.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.bank_name}</TableCell>
                    <TableCell>{account.account_no}</TableCell>
                    <TableCell>{account.account_name}</TableCell>
                    <TableCell>
                      <Badge variant={account.is_active ? 'default' : 'secondary'}>
                        {account.is_active ? (language === 'en' ? 'Active' : 'Aktif') : (language === 'en' ? 'Inactive' : 'Nonaktif')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(account)} className="gap-2">
                            <Edit className="w-4 h-4" />{language === 'en' ? 'Edit' : 'Edit'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(account)} className="gap-2 text-destructive">
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
            <DialogTitle>{editingAccount ? (language === 'en' ? 'Edit Bank Account' : 'Edit Rekening') : (language === 'en' ? 'Add Bank Account' : 'Tambah Rekening')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Bank Name' : 'Nama Bank'} *</Label>
              <Input value={formBankName} onChange={(e) => setFormBankName(e.target.value)} placeholder="e.g., Bank BCA" />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Account Number' : 'Nomor Rekening'} *</Label>
              <Input value={formAccountNo} onChange={(e) => setFormAccountNo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Account Name' : 'Nama Rekening'} *</Label>
              <Input value={formAccountName} onChange={(e) => setFormAccountName(e.target.value)} />
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
