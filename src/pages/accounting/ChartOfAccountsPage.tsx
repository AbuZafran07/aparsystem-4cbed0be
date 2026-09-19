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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { TablePagination, usePagination } from '@/components/TablePagination';
import type { Database, Tables } from '@/integrations/supabase/types';

type Account = Tables<'chart_of_accounts'>;
type AccountType = Database['public']['Enums']['account_type'];
type NormalBalance = Database['public']['Enums']['normal_balance'];

const ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
const NORMAL_BALANCES: NormalBalance[] = ['DEBIT', 'CREDIT'];

export default function ChartOfAccountsPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<AccountType>('ASSET');
  const [formNormalBalance, setFormNormalBalance] = useState<NormalBalance>('DEBIT');
  const [formControl, setFormControl] = useState(false);
  const [formActive, setFormActive] = useState(true);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['chart_of_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .order('code');
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (account: Partial<Account>) => {
      if (editingAccount) {
        const { error } = await supabase.from('chart_of_accounts').update(account).eq('id', editingAccount.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('chart_of_accounts').insert([account as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart_of_accounts'] });
      closeDialog();
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: editingAccount
          ? (language === 'en' ? 'Account updated' : 'Akun diupdate')
          : (language === 'en' ? 'Account created' : 'Akun dibuat'),
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('chart_of_accounts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart_of_accounts'] });
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: language === 'en' ? 'Account deleted' : 'Akun dihapus',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: language === 'en'
          ? 'Cannot delete: account is referenced by journal entries or other accounts'
          : 'Tidak bisa dihapus: akun sudah dipakai di jurnal atau akun lain',
        variant: 'destructive',
      });
    },
  });

  const openCreate = () => {
    setEditingAccount(null);
    setFormCode('');
    setFormName('');
    setFormType('ASSET');
    setFormNormalBalance('DEBIT');
    setFormControl(false);
    setFormActive(true);
    setIsDialogOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditingAccount(account);
    setFormCode(account.code);
    setFormName(account.name);
    setFormType(account.account_type);
    setFormNormalBalance(account.normal_balance);
    setFormControl(account.is_control_account);
    setFormActive(account.is_active);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingAccount(null);
  };

  const handleSave = () => {
    if (!formCode.trim() || !formName.trim()) {
      toast({ title: 'Error', description: language === 'en' ? 'Code and name are required' : 'Kode dan nama wajib diisi', variant: 'destructive' });
      return;
    }
    saveMutation.mutate({
      code: formCode.trim(),
      name: formName.trim(),
      account_type: formType,
      normal_balance: formNormalBalance,
      is_control_account: formControl,
      is_active: formActive,
    });
  };

  const handleDelete = (account: Account) => {
    if (confirm(language === 'en' ? `Delete ${account.code} - ${account.name}?` : `Hapus ${account.code} - ${account.name}?`)) {
      deleteMutation.mutate(account.id);
    }
  };

  const filtered = accounts.filter(a =>
    a.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const {
    paginatedItems: paginatedAccounts,
    currentPage,
    pageSize,
    totalItems,
    handlePageChange,
    handlePageSizeChange,
  } = usePagination(filtered, 50);

  const typeLabel = (t: AccountType) => {
    const map: Record<AccountType, { en: string; id: string }> = {
      ASSET: { en: 'Asset', id: 'Aset' },
      LIABILITY: { en: 'Liability', id: 'Liabilitas' },
      EQUITY: { en: 'Equity', id: 'Ekuitas' },
      REVENUE: { en: 'Revenue', id: 'Pendapatan' },
      EXPENSE: { en: 'Expense', id: 'Beban' },
    };
    return map[t][language];
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Chart of Accounts' : 'Bagan Akun'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en'
              ? 'Placeholder accounts - review with Finance/Accounting before production use'
              : 'Akun bersifat placeholder - review bersama Finance/Accounting sebelum dipakai produksi'}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          {language === 'en' ? 'Add Account' : 'Tambah Akun'}
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
                <TableHead>{language === 'en' ? 'Code' : 'Kode'}</TableHead>
                <TableHead>{language === 'en' ? 'Name' : 'Nama'}</TableHead>
                <TableHead>{language === 'en' ? 'Type' : 'Tipe'}</TableHead>
                <TableHead>{language === 'en' ? 'Normal Balance' : 'Saldo Normal'}</TableHead>
                <TableHead>{language === 'en' ? 'Control' : 'Akun Kontrol'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No accounts found' : 'Tidak ada akun'}</TableCell></TableRow>
              ) : (
                paginatedAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-mono">{account.code}</TableCell>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>{typeLabel(account.account_type)}</TableCell>
                    <TableCell>{account.normal_balance}</TableCell>
                    <TableCell>
                      {account.is_control_account && (
                        <Badge variant="outline">{language === 'en' ? 'Control' : 'Kontrol'}</Badge>
                      )}
                    </TableCell>
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
            <DialogTitle>{editingAccount ? (language === 'en' ? 'Edit Account' : 'Edit Akun') : (language === 'en' ? 'Add Account' : 'Tambah Akun')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Code' : 'Kode'} *</Label>
              <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="e.g., 1200" />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Name' : 'Nama'} *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Accounts Receivable" />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Account Type' : 'Tipe Akun'}</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as AccountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Normal Balance' : 'Saldo Normal'}</Label>
              <Select value={formNormalBalance} onValueChange={(v) => setFormNormalBalance(v as NormalBalance)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NORMAL_BALANCES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formControl} onCheckedChange={setFormControl} />
              <Label>{language === 'en' ? 'Control account (e.g. AR/AP)' : 'Akun kontrol (mis. AR/AP)'}</Label>
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
