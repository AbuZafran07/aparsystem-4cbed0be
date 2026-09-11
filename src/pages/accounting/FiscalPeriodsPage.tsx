import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen, ShieldCheck, PlayCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRoleAccess } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type FiscalPeriod = Tables<'fiscal_periods'>;

const statusBadge: Record<FiscalPeriod['status'], { en: string; id: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  OPEN: { en: 'Open', id: 'Terbuka', variant: 'default' },
  SOFT_CLOSE: { en: 'Soft Close', id: 'Tutup Sementara', variant: 'secondary' },
  HARD_CLOSE: { en: 'Hard Close', id: 'Tutup Permanen', variant: 'destructive' },
};

export default function FiscalPeriodsPage() {
  const { language } = useLanguage();
  const { hasRole } = useRoleAccess();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = hasRole(['SUPER_ADMIN']);
  const [runningOpeningBalance, setRunningOpeningBalance] = useState(false);

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ['fiscal_periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fiscal_periods')
        .select('*')
        .order('fiscal_year', { ascending: false })
        .order('period_no', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: hasOpeningBalance } = useQuery({
    queryKey: ['journal_entries', 'opening_balance_exists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('source_type', 'OPENING_BALANCE')
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const closeMutation = useMutation({
    mutationFn: async ({ periodId, hard }: { periodId: string; hard: boolean }) => {
      const { error } = await supabase.rpc('close_fiscal_period', { _period_id: periodId, _hard: hard });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal_periods'] });
      toast({ title: language === 'en' ? 'Success' : 'Berhasil', description: language === 'en' ? 'Period closed' : 'Periode ditutup' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (periodId: string) => {
      const { error } = await supabase.rpc('reopen_fiscal_period', { _period_id: periodId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal_periods'] });
      toast({ title: language === 'en' ? 'Success' : 'Berhasil', description: language === 'en' ? 'Period reopened' : 'Periode dibuka kembali' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleRunOpeningBalance = async () => {
    if (!confirm(
      language === 'en'
        ? 'Run the one-time opening balance journal as of cutover 2026-09-11? This can only be run once.'
        : 'Jalankan jurnal opening balance satu kali per cutover 2026-09-11? Ini hanya bisa dijalankan sekali.'
    )) return;

    try {
      setRunningOpeningBalance(true);
      const { data, error } = await supabase.rpc('create_opening_balance_journal');
      if (error) throw error;
      const res = data as any;
      toast({
        title: language === 'en' ? 'Opening balance created' : 'Opening balance dibuat',
        description: `${res?.journal_no ?? ''} - AR: ${res?.ar_total ?? 0}, AP: ${res?.ap_total ?? 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal_periods'] });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setRunningOpeningBalance(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {language === 'en' ? 'Fiscal Periods' : 'Periode Fiskal'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {language === 'en' ? 'Manage accounting period open/close status' : 'Kelola status buka/tutup periode akuntansi'}
        </p>
      </div>

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{language === 'en' ? 'Opening Balance (one-time)' : 'Opening Balance (sekali jalan)'}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {language === 'en'
                ? 'Creates the opening balance journal as of cutover 2026-09-11 from currently outstanding AR/AP (APPROVED/PARTIAL/PAID). Can only be run once.'
                : 'Membuat jurnal opening balance per cutover 2026-09-11 dari outstanding AR/AP saat ini (APPROVED/PARTIAL/PAID). Hanya bisa dijalankan sekali.'}
            </p>
            <Button
              onClick={handleRunOpeningBalance}
              disabled={runningOpeningBalance || hasOpeningBalance}
              className="gap-2 shrink-0"
            >
              <PlayCircle className="w-4 h-4" />
              {hasOpeningBalance
                ? (language === 'en' ? 'Already created' : 'Sudah dibuat')
                : (language === 'en' ? 'Run Opening Balance' : 'Jalankan Opening Balance')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Period' : 'Periode'}</TableHead>
                <TableHead>{language === 'en' ? 'Start' : 'Mulai'}</TableHead>
                <TableHead>{language === 'en' ? 'End' : 'Selesai'}</TableHead>
                <TableHead>Status</TableHead>
                {isSuperAdmin && <TableHead className="w-[220px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">{language === 'en' ? 'Loading...' : 'Memuat...'}</TableCell></TableRow>
              ) : periods.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{language === 'en' ? 'No fiscal periods found' : 'Tidak ada periode fiskal'}</TableCell></TableRow>
              ) : (
                periods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell className="font-medium">{period.fiscal_year}-{String(period.period_no).padStart(2, '0')}</TableCell>
                    <TableCell>{new Date(period.start_date).toLocaleDateString('id-ID')}</TableCell>
                    <TableCell>{new Date(period.end_date).toLocaleDateString('id-ID')}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadge[period.status].variant}>{statusBadge[period.status][language]}</Badge>
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell>
                        <div className="flex gap-2">
                          {period.status === 'OPEN' ? (
                            <>
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => closeMutation.mutate({ periodId: period.id, hard: false })}>
                                <Lock className="w-3.5 h-3.5" />{language === 'en' ? 'Soft Close' : 'Tutup Sementara'}
                              </Button>
                              <Button size="sm" variant="destructive" className="gap-1" onClick={() => closeMutation.mutate({ periodId: period.id, hard: true })}>
                                <ShieldCheck className="w-3.5 h-3.5" />{language === 'en' ? 'Hard Close' : 'Tutup Permanen'}
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => reopenMutation.mutate(period.id)}>
                              <LockOpen className="w-3.5 h-3.5" />{language === 'en' ? 'Reopen' : 'Buka Kembali'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
