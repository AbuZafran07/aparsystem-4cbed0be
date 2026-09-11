import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type AccountingRule = Tables<'accounting_rules'>;
type Account = Tables<'chart_of_accounts'>;

const SOURCE_TYPE_LABEL: Record<string, { en: string; id: string }> = {
  AR_INVOICE: { en: 'AR Invoice approved', id: 'AR Invoice disetujui' },
  AR_RECEIPT: { en: 'AR Receipt recorded', id: 'Penerimaan AR dicatat' },
  AP_INVOICE: { en: 'AP Invoice approved', id: 'AP Invoice disetujui' },
  AP_PAYMENT: { en: 'AP Payment recorded', id: 'Pembayaran AP dicatat' },
};

export default function AccountingRulesPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingRule, setEditingRule] = useState<AccountingRule | null>(null);
  const [formDebit, setFormDebit] = useState('');
  const [formCredit, setFormCredit] = useState('');

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['accounting_rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounting_rules').select('*').order('source_type');
      if (error) throw error;
      return data;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['chart_of_accounts', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('is_active', true)
        .order('code');
      if (error) throw error;
      return data;
    },
  });

  const accountLabel = (id: string) => {
    const acc = accounts.find(a => a.id === id);
    return acc ? `${acc.code} - ${acc.name}` : '-';
  };

  const saveMutation = useMutation({
    mutationFn: async (rule: { id: string; debit_account_id: string; credit_account_id: string }) => {
      const { error } = await supabase
        .from('accounting_rules')
        .update({ debit_account_id: rule.debit_account_id, credit_account_id: rule.credit_account_id })
        .eq('id', rule.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting_rules'] });
      setEditingRule(null);
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: language === 'en' ? 'Accounting rule updated' : 'Rule akuntansi diupdate',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openEdit = (rule: AccountingRule) => {
    setEditingRule(rule);
    setFormDebit(rule.debit_account_id);
    setFormCredit(rule.credit_account_id);
  };

  const handleSave = () => {
    if (!editingRule || !formDebit || !formCredit) return;
    saveMutation.mutate({ id: editingRule.id, debit_account_id: formDebit, credit_account_id: formCredit });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {language === 'en' ? 'Accounting Rules' : 'Rule Akuntansi'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {language === 'en'
            ? 'Debit/credit account mapping used when AR/AP events are auto-posted to the General Ledger'
            : 'Pemetaan akun debit/kredit yang dipakai saat event AR/AP otomatis diposting ke General Ledger'}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Event' : 'Kejadian'}</TableHead>
                <TableHead>{language === 'en' ? 'Debit Account' : 'Akun Debit'}</TableHead>
                <TableHead>{language === 'en' ? 'Credit Account' : 'Akun Kredit'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : rules.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No rules found' : 'Tidak ada rule'}</TableCell></TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">
                      {SOURCE_TYPE_LABEL[rule.source_type]?.[language] || rule.source_type}
                    </TableCell>
                    <TableCell>{accountLabel(rule.debit_account_id)}</TableCell>
                    <TableCell>{accountLabel(rule.credit_account_id)}</TableCell>
                    <TableCell>
                      <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                        {rule.is_active ? (language === 'en' ? 'Active' : 'Aktif') : (language === 'en' ? 'Inactive' : 'Nonaktif')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingRule} onOpenChange={(open) => !open && setEditingRule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRule ? (SOURCE_TYPE_LABEL[editingRule.source_type]?.[language] || editingRule.source_type) : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Debit Account' : 'Akun Debit'}</Label>
              <Select value={formDebit} onValueChange={setFormDebit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Credit Account' : 'Akun Kredit'}</Label>
              <Select value={formCredit} onValueChange={setFormCredit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRule(null)}>{language === 'en' ? 'Cancel' : 'Batal'}</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (language === 'en' ? 'Saving...' : 'Menyimpan...') : (language === 'en' ? 'Save' : 'Simpan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
