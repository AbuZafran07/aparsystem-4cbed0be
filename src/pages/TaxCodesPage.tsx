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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type TaxCode = Tables<'tax_codes'>;
type Account = Tables<'chart_of_accounts'>;

export default function TaxCodesPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaxCode | null>(null);

  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formTaxType, setFormTaxType] = useState<'OUTPUT' | 'INPUT'>('OUTPUT');
  const [formRate, setFormRate] = useState(11);
  const [formGlAccountId, setFormGlAccountId] = useState('');
  const [formActive, setFormActive] = useState(true);

  const { data: taxCodes = [], isLoading } = useQuery({
    queryKey: ['tax_codes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tax_codes').select('*').order('code');
      if (error) throw error;
      return data as TaxCode[];
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

  const accountLabel = (id: string | null) => {
    if (!id) return '-';
    const a = accounts.find(x => x.id === id);
    return a ? `${a.code} - ${a.name}` : '-';
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<TaxCode>) => {
      if (editing) {
        const { error } = await supabase.from('tax_codes').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tax_codes').insert([payload as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax_codes'] });
      closeDialog();
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: editing
          ? (language === 'en' ? 'Tax code updated' : 'Kode pajak diupdate')
          : (language === 'en' ? 'Tax code created' : 'Kode pajak dibuat'),
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tax_codes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax_codes'] });
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: language === 'en' ? 'Tax code deleted' : 'Kode pajak dihapus',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setFormCode('');
    setFormName('');
    setFormTaxType('OUTPUT');
    setFormRate(11);
    setFormGlAccountId('');
    setFormActive(true);
    setIsDialogOpen(true);
  };

  const openEdit = (tc: TaxCode) => {
    setEditing(tc);
    setFormCode(tc.code);
    setFormName(tc.name);
    setFormTaxType(tc.tax_type as 'OUTPUT' | 'INPUT');
    setFormRate(tc.rate);
    setFormGlAccountId(tc.gl_account_id || '');
    setFormActive(tc.is_active);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditing(null);
  };

  const handleSave = () => {
    if (!formCode.trim() || !formName.trim()) {
      toast({ title: 'Error', description: language === 'en' ? 'Code and name are required' : 'Kode dan nama wajib diisi', variant: 'destructive' });
      return;
    }
    saveMutation.mutate({
      code: formCode.trim(),
      name: formName.trim(),
      tax_type: formTaxType,
      rate: formRate,
      gl_account_id: formGlAccountId || null,
      is_active: formActive,
    });
  };

  const handleDelete = (tc: TaxCode) => {
    if (confirm(language === 'en' ? `Delete ${tc.code}?` : `Hapus ${tc.code}?`)) {
      deleteMutation.mutate(tc.id);
    }
  };

  const filtered = taxCodes.filter(tc =>
    tc.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Tax Codes' : 'Master Pajak'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Manage VAT/PPN codes used by AR/AP invoice tax splitting' : 'Kelola kode pajak (PPN) yang dipakai untuk pemecahan pajak invoice AR/AP'}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          {language === 'en' ? 'Add Tax Code' : 'Tambah Kode Pajak'}
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
                <TableHead className="text-right">{language === 'en' ? 'Rate' : 'Tarif'}</TableHead>
                <TableHead>{language === 'en' ? 'GL Account' : 'Akun GL'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No tax codes found' : 'Tidak ada kode pajak'}</TableCell></TableRow>
              ) : (
                filtered.map((tc) => (
                  <TableRow key={tc.id}>
                    <TableCell className="font-mono font-medium">{tc.code}</TableCell>
                    <TableCell>{tc.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {tc.tax_type === 'OUTPUT'
                          ? (language === 'en' ? 'Output (Sales)' : 'Keluaran (Penjualan)')
                          : (language === 'en' ? 'Input (Purchase)' : 'Masukan (Pembelian)')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{tc.rate}%</TableCell>
                    <TableCell className={!tc.gl_account_id ? 'text-warning' : ''}>
                      {accountLabel(tc.gl_account_id)}
                      {!tc.gl_account_id && (
                        <span className="block text-xs">{language === 'en' ? 'Not mapped yet' : 'Belum dipetakan'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tc.is_active ? 'default' : 'secondary'}>
                        {tc.is_active ? (language === 'en' ? 'Active' : 'Aktif') : (language === 'en' ? 'Inactive' : 'Nonaktif')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(tc)} className="gap-2">
                            <Edit className="w-4 h-4" />{language === 'en' ? 'Edit' : 'Edit'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(tc)} className="gap-2 text-destructive">
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
            <DialogTitle>{editing ? (language === 'en' ? 'Edit Tax Code' : 'Edit Kode Pajak') : (language === 'en' ? 'Add Tax Code' : 'Tambah Kode Pajak')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Code' : 'Kode'} *</Label>
                <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="PPN-OUT" />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Rate (%)' : 'Tarif (%)'}</Label>
                <Input type="number" value={formRate} onChange={(e) => setFormRate(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Name' : 'Nama'} *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="PPN Keluaran 11%" />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Type' : 'Tipe'}</Label>
              <Select value={formTaxType} onValueChange={(v) => setFormTaxType(v as 'OUTPUT' | 'INPUT')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUTPUT">{language === 'en' ? 'Output (Sales)' : 'Keluaran (Penjualan)'}</SelectItem>
                  <SelectItem value="INPUT">{language === 'en' ? 'Input (Purchase)' : 'Masukan (Pembelian)'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'GL Account' : 'Akun GL'}</Label>
              <Select value={formGlAccountId} onValueChange={setFormGlAccountId}>
                <SelectTrigger><SelectValue placeholder={language === 'en' ? 'Select account' : 'Pilih akun'} /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
