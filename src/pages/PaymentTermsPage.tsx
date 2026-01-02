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

type PaymentTerm = Tables<'payment_terms'>;

export default function PaymentTermsPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<PaymentTerm | null>(null);
  
  const [formName, setFormName] = useState('');
  const [formDays, setFormDays] = useState(0);
  const [formActive, setFormActive] = useState(true);

  const { data: terms = [], isLoading } = useQuery({
    queryKey: ['payment_terms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_terms')
        .select('*')
        .order('days');
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (term: Partial<PaymentTerm>) => {
      if (editingTerm) {
        const { error } = await supabase.from('payment_terms').update(term).eq('id', editingTerm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('payment_terms').insert([term as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment_terms'] });
      closeDialog();
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: editingTerm
          ? (language === 'en' ? 'Payment term updated' : 'Payment term diupdate')
          : (language === 'en' ? 'Payment term created' : 'Payment term dibuat'),
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payment_terms').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment_terms'] });
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: language === 'en' ? 'Payment term deleted' : 'Payment term dihapus',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingTerm(null);
    setFormName('');
    setFormDays(0);
    setFormActive(true);
    setIsDialogOpen(true);
  };

  const openEdit = (term: PaymentTerm) => {
    setEditingTerm(term);
    setFormName(term.terms_name);
    setFormDays(term.days);
    setFormActive(term.is_active);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingTerm(null);
  };

  const handleSave = () => {
    if (!formName.trim()) {
      toast({ title: 'Error', description: language === 'en' ? 'Name is required' : 'Nama wajib diisi', variant: 'destructive' });
      return;
    }
    saveMutation.mutate({
      terms_name: formName,
      days: formDays,
      is_active: formActive,
    });
  };

  const handleDelete = (term: PaymentTerm) => {
    if (confirm(language === 'en' ? `Delete ${term.terms_name}?` : `Hapus ${term.terms_name}?`)) {
      deleteMutation.mutate(term.id);
    }
  };

  const filtered = terms.filter(t =>
    t.terms_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'Payment Terms' : 'Termin Pembayaran'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Manage payment terms' : 'Kelola termin pembayaran'}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          {language === 'en' ? 'Add Term' : 'Tambah Termin'}
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
                <TableHead>{language === 'en' ? 'Name' : 'Nama'}</TableHead>
                <TableHead>{language === 'en' ? 'Days' : 'Hari'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No payment terms found' : 'Tidak ada termin'}</TableCell></TableRow>
              ) : (
                filtered.map((term) => (
                  <TableRow key={term.id}>
                    <TableCell className="font-medium">{term.terms_name}</TableCell>
                    <TableCell>{term.days} {language === 'en' ? 'days' : 'hari'}</TableCell>
                    <TableCell>
                      <Badge variant={term.is_active ? 'default' : 'secondary'}>
                        {term.is_active ? (language === 'en' ? 'Active' : 'Aktif') : (language === 'en' ? 'Inactive' : 'Nonaktif')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(term)} className="gap-2">
                            <Edit className="w-4 h-4" />{language === 'en' ? 'Edit' : 'Edit'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(term)} className="gap-2 text-destructive">
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
            <DialogTitle>{editingTerm ? (language === 'en' ? 'Edit Payment Term' : 'Edit Termin') : (language === 'en' ? 'Add Payment Term' : 'Tambah Termin')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Term Name' : 'Nama Termin'} *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., NET 30" />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Days' : 'Jumlah Hari'}</Label>
              <Input type="number" value={formDays} onChange={(e) => setFormDays(parseInt(e.target.value) || 0)} />
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
