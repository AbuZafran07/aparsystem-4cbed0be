import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, MoreHorizontal, PlayCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type FixedAsset = Tables<'fixed_assets'>;
type Account = Tables<'chart_of_accounts'>;
type Department = Tables<'departments'>;

const statusConfig: Record<string, { en: string; id: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ACTIVE: { en: 'Active', id: 'Aktif', variant: 'default' },
  FULLY_DEPRECIATED: { en: 'Fully Depreciated', id: 'Penyusutan Penuh', variant: 'secondary' },
  DISPOSED: { en: 'Disposed', id: 'Dilepas', variant: 'destructive' },
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const emptyForm = {
  asset_code: '',
  name: '',
  category: '',
  acquisition_date: new Date().toISOString().split('T')[0],
  acquisition_cost: '',
  salvage_value: '0',
  useful_life_months: '',
  asset_account_id: '',
  accum_deprec_account_id: '',
  deprec_expense_account_id: '',
  department_id: '',
  notes: '',
};

const monthNames = [
  { value: 1, en: 'January', id: 'Januari' }, { value: 2, en: 'February', id: 'Februari' },
  { value: 3, en: 'March', id: 'Maret' }, { value: 4, en: 'April', id: 'April' },
  { value: 5, en: 'May', id: 'Mei' }, { value: 6, en: 'June', id: 'Juni' },
  { value: 7, en: 'July', id: 'Juli' }, { value: 8, en: 'August', id: 'Agustus' },
  { value: 9, en: 'September', id: 'September' }, { value: 10, en: 'October', id: 'Oktober' },
  { value: 11, en: 'November', id: 'November' }, { value: 12, en: 'December', id: 'Desember' },
];

export default function FixedAssetsPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FixedAsset | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [runYear, setRunYear] = useState(new Date().getFullYear());
  const [runMonth, setRunMonth] = useState(new Date().getMonth() + 1);
  const [isRunning, setIsRunning] = useState(false);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['fixed_assets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_assets').select('*').order('asset_code');
      if (error) throw error;
      return data as FixedAsset[];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['chart_of_accounts', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('is_active', true).order('code');
      if (error) throw error;
      return data as Account[];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('*').order('name');
      if (error) throw error;
      return data as Department[];
    },
  });

  const accountLabel = (id: string | null) => {
    if (!id) return '-';
    const a = accounts.find(x => x.id === id);
    return a ? `${a.code} - ${a.name}` : '-';
  };

  const monthlyDepreciation = (asset: FixedAsset) =>
    asset.useful_life_months > 0 ? (asset.acquisition_cost - asset.salvage_value) / asset.useful_life_months : 0;

  const netBookValue = (asset: FixedAsset) => asset.acquisition_cost - asset.accumulated_depreciation;

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      if (editing) {
        const { error } = await supabase.from('fixed_assets').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from('fixed_assets').insert([{ ...payload, created_by: userData.user?.id || '' }] as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed_assets'] });
      closeDialog();
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: editing
          ? (language === 'en' ? 'Asset updated' : 'Aset diupdate')
          : (language === 'en' ? 'Asset created' : 'Aset dibuat'),
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fixed_assets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed_assets'] });
      toast({ title: language === 'en' ? 'Success' : 'Berhasil', description: language === 'en' ? 'Asset deleted' : 'Aset dihapus' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setIsDialogOpen(true);
  };

  const openEdit = (asset: FixedAsset) => {
    setEditing(asset);
    setForm({
      asset_code: asset.asset_code,
      name: asset.name,
      category: asset.category || '',
      acquisition_date: asset.acquisition_date,
      acquisition_cost: String(asset.acquisition_cost),
      salvage_value: String(asset.salvage_value),
      useful_life_months: String(asset.useful_life_months),
      asset_account_id: asset.asset_account_id || '',
      accum_deprec_account_id: asset.accum_deprec_account_id || '',
      deprec_expense_account_id: asset.deprec_expense_account_id || '',
      department_id: asset.department_id || '',
      notes: asset.notes || '',
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditing(null);
  };

  const handleSave = () => {
    if (!form.asset_code.trim() || !form.name.trim() || !form.acquisition_date || !form.acquisition_cost || !form.useful_life_months) {
      toast({
        title: 'Error',
        description: language === 'en' ? 'Please fill code, name, acquisition date, cost, and useful life' : 'Mohon isi kode, nama, tanggal perolehan, nilai, dan masa manfaat',
        variant: 'destructive',
      });
      return;
    }
    saveMutation.mutate({
      asset_code: form.asset_code.trim(),
      name: form.name.trim(),
      category: form.category || null,
      acquisition_date: form.acquisition_date,
      acquisition_cost: parseFloat(form.acquisition_cost) || 0,
      salvage_value: parseFloat(form.salvage_value) || 0,
      useful_life_months: parseInt(form.useful_life_months) || 0,
      asset_account_id: form.asset_account_id || null,
      accum_deprec_account_id: form.accum_deprec_account_id || null,
      deprec_expense_account_id: form.deprec_expense_account_id || null,
      department_id: form.department_id || null,
      notes: form.notes || null,
    });
  };

  const handleDelete = (asset: FixedAsset) => {
    if (confirm(language === 'en' ? `Delete ${asset.asset_code} - ${asset.name}?` : `Hapus ${asset.asset_code} - ${asset.name}?`)) {
      deleteMutation.mutate(asset.id);
    }
  };

  const handleRunDepreciation = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.rpc('run_monthly_depreciation', { _year: runYear, _month: runMonth });
      if (error) throw error;
      const res = data as any;
      toast({
        title: language === 'en' ? 'Depreciation run complete' : 'Penyusutan selesai dijalankan',
        description: language === 'en'
          ? `Posted: ${res?.posted ?? 0}, Skipped: ${res?.skipped ?? 0}, Total: ${formatCurrency(res?.total_amount ?? 0)}`
          : `Diposting: ${res?.posted ?? 0}, Dilewati: ${res?.skipped ?? 0}, Total: ${formatCurrency(res?.total_amount ?? 0)}`,
      });
      setIsRunDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['fixed_assets'] });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsRunning(false);
    }
  };

  const filtered = assets.filter(a =>
    a.asset_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.category || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Fixed Assets' : 'Harta Tetap'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Fixed asset register with automatic monthly depreciation posting' : 'Register harta tetap dengan posting penyusutan bulanan otomatis'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setIsRunDialogOpen(true)}>
            <PlayCircle className="w-4 h-4" />
            {language === 'en' ? 'Run Depreciation' : 'Jalankan Penyusutan'}
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            {language === 'en' ? 'Add Asset' : 'Tambah Aset'}
          </Button>
        </div>
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
                <TableHead>{language === 'en' ? 'Category' : 'Kategori'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Acquisition Cost' : 'Nilai Perolehan'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Accum. Deprec.' : 'Akumulasi Penyusutan'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Book Value' : 'Nilai Buku'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Deprec./Month' : 'Peny./Bulan'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No assets found' : 'Tidak ada aset'}</TableCell></TableRow>
              ) : (
                filtered.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-mono font-medium">{asset.asset_code}</TableCell>
                    <TableCell>{asset.name}</TableCell>
                    <TableCell>{asset.category || '-'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(asset.acquisition_cost)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(asset.accumulated_depreciation)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(netBookValue(asset))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(monthlyDepreciation(asset))}</TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[asset.status]?.variant || 'secondary'}>
                        {statusConfig[asset.status]?.[language] || asset.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(asset)} className="gap-2">
                            <Edit className="w-4 h-4" />{language === 'en' ? 'Edit' : 'Edit'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(asset)} className="gap-2 text-destructive">
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

      {/* Create/Edit dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? (language === 'en' ? 'Edit Asset' : 'Edit Aset') : (language === 'en' ? 'Add Asset' : 'Tambah Aset')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Asset Code' : 'Kode Aset'} *</Label>
                <Input value={form.asset_code} onChange={(e) => setForm({ ...form, asset_code: e.target.value })} placeholder="FA-0001" />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Category' : 'Kategori'}</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={language === 'en' ? 'e.g., Vehicle, Equipment' : 'mis. Kendaraan, Peralatan'} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Asset Name' : 'Nama Aset'} *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Acquisition Date' : 'Tanggal Perolehan'} *</Label>
                <Input type="date" value={form.acquisition_date} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Acquisition Cost' : 'Nilai Perolehan'} *</Label>
                <Input type="number" value={form.acquisition_cost} onChange={(e) => setForm({ ...form, acquisition_cost: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Salvage Value' : 'Nilai Residu'}</Label>
                <Input type="number" value={form.salvage_value} onChange={(e) => setForm({ ...form, salvage_value: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Useful Life (months)' : 'Masa Manfaat (bulan)'} *</Label>
                <Input type="number" value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Department (optional)' : 'Departemen (Opsional)'}</Label>
                <Select value={form.department_id || 'none'} onValueChange={(v) => setForm({ ...form, department_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select department' : 'Pilih departemen'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-</SelectItem>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Asset Account (COA)' : 'Akun Aset (COA)'}</Label>
              <Select value={form.asset_account_id || 'none'} onValueChange={(v) => setForm({ ...form, asset_account_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select account' : 'Pilih akun'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Accum. Depreciation Account' : 'Akun Akumulasi Penyusutan'}</Label>
                <Select value={form.accum_deprec_account_id || 'none'} onValueChange={(v) => setForm({ ...form, accum_deprec_account_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select account' : 'Pilih akun'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-</SelectItem>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Depreciation Expense Account' : 'Akun Beban Penyusutan'}</Label>
                <Select value={form.deprec_expense_account_id || 'none'} onValueChange={(v) => setForm({ ...form, deprec_expense_account_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select account' : 'Pilih akun'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-</SelectItem>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Notes' : 'Catatan'}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
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

      {/* Run depreciation dialog */}
      <Dialog open={isRunDialogOpen} onOpenChange={setIsRunDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Run Monthly Depreciation' : 'Jalankan Penyusutan Bulanan'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Year' : 'Tahun'}</Label>
                <Input type="number" value={runYear} onChange={(e) => setRunYear(parseInt(e.target.value) || runYear)} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Month' : 'Bulan'}</Label>
                <Select value={String(runMonth)} onValueChange={(v) => setRunMonth(parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthNames.map(m => <SelectItem key={m.value} value={String(m.value)}>{m[language]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {language === 'en'
                ? 'Posts depreciation for every active asset that has no entry yet for this period. Safe to re-run — already-posted periods are skipped.'
                : 'Memposting penyusutan untuk setiap aset aktif yang belum punya entry di periode ini. Aman dijalankan ulang — periode yang sudah diposting akan dilewati.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRunDialogOpen(false)}>{language === 'en' ? 'Cancel' : 'Batal'}</Button>
            <Button onClick={handleRunDepreciation} disabled={isRunning}>
              {isRunning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Run' : 'Jalankan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
