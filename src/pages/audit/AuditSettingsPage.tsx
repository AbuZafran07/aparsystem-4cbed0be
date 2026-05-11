import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings, Building2, Palette, Trash2, Pencil, Plus,
  Loader2, CheckCircle2, CalendarDays, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuditConfig } from '@/contexts/AuditConfigContext';
import { cn } from '@/lib/utils';

const db = supabase as any;

interface Department { id: string; name: string; color: string; created_at: string; }

// ── Preset color palette ───────────────────────────────────────────────────────
const PRESET_COLORS = [
  '#185FA5', '#1D9E75', '#534AB7', '#BA7517', '#D4537E',
  '#E63946', '#2A9D8F', '#E76F51', '#264653', '#F4A261',
  '#6D6875', '#B5838D', '#457B9D', '#A8DADC', '#2D6A4F',
];

// ── Color Picker ───────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="space-y-3">
      {/* Preset swatches */}
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              'w-7 h-7 rounded-lg border-2 transition-all',
              value === c ? 'border-foreground scale-110 shadow-md' : 'border-transparent hover:scale-105',
            )}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>
      {/* Custom color row */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer border border-input p-0.5"
            title="Pilih warna custom"
          />
        </div>
        <Input
          value={value}
          onChange={e => {
            const v = e.target.value;
            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v);
          }}
          placeholder="#185FA5"
          className="font-mono w-32 text-sm"
          maxLength={7}
        />
        <div className="w-8 h-8 rounded-lg border border-input flex-shrink-0" style={{ backgroundColor: value }} />
      </div>
    </div>
  );
}

// ── Dept Form Dialog ───────────────────────────────────────────────────────────
interface DeptDialogProps {
  open: boolean;
  dept: Department | null;
  onClose: () => void;
  onSave: (name: string, color: string) => Promise<void>;
  saving: boolean;
}

function DeptDialog({ open, dept, onClose, onSave, saving }: DeptDialogProps) {
  const [name,  setName]  = useState('');
  const [color, setColor] = useState('#185FA5');

  useEffect(() => {
    if (open) {
      setName(dept?.name  ?? '');
      setColor(dept?.color ?? PRESET_COLORS[0]);
    }
  }, [open, dept]);

  const handleSave = async () => {
    if (!name.trim()) return;
    await onSave(name.trim(), color);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            {dept ? 'Edit Departemen' : 'Tambah Departemen'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label>Nama Departemen</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Contoh: Operasional, Marketing, IT..."
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-muted-foreground" />
              Warna
            </Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Preview */}
          {name && (
            <div className="rounded-lg bg-muted/40 px-4 py-3 flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Preview:</span>
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {name}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = 'umum' | 'departemen';

export default function AuditSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { year, setYear } = useAuditConfig();

  const [tab, setTab]               = useState<Tab>('umum');
  const [yearInput, setYearInput]   = useState(String(year));
  const [yearSaved, setYearSaved]   = useState(false);

  // Dept dialog
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editingDept,    setEditingDept]    = useState<Department | null>(null);

  // Delete confirm
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDept,     setDeletingDept]     = useState<Department | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────
  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ['audit-departments'],
    queryFn: async () => {
      const { data, error } = await db.from('departments').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: txCountByDept = {} } = useQuery<Record<string, number>>({
    queryKey: ['audit-dept-tx-count'],
    queryFn: async () => {
      const { data, error } = await db
        .from('cash_out_transactions')
        .select('department_id');
      if (error) throw error;
      const m: Record<string, number> = {};
      (data ?? []).forEach((t: any) => { m[t.department_id] = (m[t.department_id] ?? 0) + 1; });
      return m;
    },
  });

  // ── Year save ─────────────────────────────────────────────────────────
  const applyYear = (n: number) => {
    setYear(n);
    setYearInput(String(n));
    setYearSaved(true);
    setTimeout(() => setYearSaved(false), 2000);
    qc.invalidateQueries({ queryKey: ['audit-transactions'] });
    qc.invalidateQueries({ queryKey: ['audit-budgets'] });
    qc.invalidateQueries({ queryKey: ['audit-sidebar-alert-count'] });
    toast({ title: 'Tahun aktif diperbarui', description: `Semua halaman audit sekarang menggunakan tahun ${n}` });
  };

  const handleSaveYear = () => {
    const n = parseInt(yearInput, 10);
    if (isNaN(n) || n < 2020 || n > 2099) {
      toast({ title: 'Tahun tidak valid', description: 'Masukkan tahun antara 2020–2099', variant: 'destructive' });
      return;
    }
    applyYear(n);
  };

  // ── Dept mutations ────────────────────────────────────────────────────
  const [deptSaving, setDeptSaving] = useState(false);

  const handleSaveDept = async (name: string, color: string) => {
    setDeptSaving(true);
    try {
      if (editingDept) {
        const { error } = await db.from('departments').update({ name, color }).eq('id', editingDept.id);
        if (error) throw error;
        toast({ title: 'Berhasil', description: `Departemen "${name}" diperbarui` });
      } else {
        const { error } = await db.from('departments').insert([{ name, color }]);
        if (error) throw error;
        toast({ title: 'Berhasil', description: `Departemen "${name}" ditambahkan` });
      }
      qc.invalidateQueries({ queryKey: ['audit-departments'] });
      qc.invalidateQueries({ queryKey: ['audit-sidebar-alert-count'] });
      setDeptDialogOpen(false);
      setEditingDept(null);
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' });
    } finally {
      setDeptSaving(false);
    }
  };

  const handleDeleteDept = async () => {
    if (!deletingDept) return;
    try {
      const { error } = await db.from('departments').delete().eq('id', deletingDept.id);
      if (error) {
        if (error.code === '23503') {
          toast({ title: 'Tidak bisa dihapus', description: `Departemen "${deletingDept.name}" masih memiliki transaksi. Hapus transaksinya terlebih dahulu.`, variant: 'destructive' });
        } else {
          throw error;
        }
        return;
      }
      qc.invalidateQueries({ queryKey: ['audit-departments'] });
      qc.invalidateQueries({ queryKey: ['audit-dept-tx-count'] });
      toast({ title: 'Berhasil', description: `Departemen "${deletingDept.name}" dihapus` });
      setDeleteDialogOpen(false);
      setDeletingDept(null);
    } catch (e: any) {
      toast({ title: 'Gagal menghapus', description: e.message, variant: 'destructive' });
    }
  };

  const openEdit = (dept: Department) => { setEditingDept(dept); setDeptDialogOpen(true); };
  const openAdd  = () => { setEditingDept(null); setDeptDialogOpen(true); };
  const openDelete = (dept: Department) => { setDeletingDept(dept); setDeleteDialogOpen(true); };

  // ── Range of selectable years ─────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const yearRange = Array.from({ length: 8 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
          <Settings className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Pengaturan</h1>
          <p className="text-sm text-muted-foreground">Konfigurasi modul Audit Cash Out</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: 'umum',       label: 'Umum',         icon: Settings   },
          { key: 'departemen', label: 'Departemen',    icon: Building2  },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: UMUM ─────────────────────────────────────────────────── */}
      {tab === 'umum' && (
        <div className="space-y-5 max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                Tahun Aktif
              </CardTitle>
              <CardDescription>
                Menentukan tahun yang digunakan di seluruh halaman Audit Cash Out
                (Dashboard, Transaksi, Budget, Alert, Export).
                Perubahan berlaku langsung tanpa reload.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick year buttons */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Pilih cepat</Label>
                <div className="flex flex-wrap gap-2">
                  {yearRange.map(y => (
                    <button
                      key={y}
                      onClick={() => applyYear(y)}
                      className={cn(
                        'px-4 py-1.5 rounded-lg text-sm font-semibold border transition-all',
                        String(y) === yearInput
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/40 border-border hover:bg-muted',
                      )}
                    >
                      {y}
                      {y === currentYear && (
                        <span className="ml-1 text-[10px] opacity-60">sekarang</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual input */}
              <div className="space-y-1.5">
                <Label>Atau ketik tahun</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={yearInput}
                    onChange={e => setYearInput(e.target.value)}
                    min={2020}
                    max={2099}
                    className="w-32 font-mono"
                    onKeyDown={e => e.key === 'Enter' && handleSaveYear()}
                  />
                  <Button onClick={handleSaveYear} className="gap-2">
                    {yearSaved
                      ? <><CheckCircle2 className="w-4 h-4" /> Tersimpan</>
                      : 'Terapkan'
                    }
                  </Button>
                </div>
              </div>

              {/* Current active year badge */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-sm text-muted-foreground">Tahun aktif saat ini:</span>
                <Badge className="text-sm px-3 py-0.5 font-bold">{year}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-muted">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Pengaturan tahun disimpan di browser (localStorage).</p>
                  <p>Jika mengakses dari device/browser berbeda, perlu di-set ulang.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab: DEPARTEMEN ──────────────────────────────────────────── */}
      {tab === 'departemen' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {departments.length} departemen terdaftar · Digunakan di input transaksi, budget, dan laporan
              </p>
            </div>
            <Button onClick={openAdd} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> Tambah Departemen
            </Button>
          </div>

          {/* Dept cards grid */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : departments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Belum ada departemen</p>
                <p className="text-sm mt-1">Tambahkan departemen pertama untuk mulai menggunakan modul ini</p>
                <Button onClick={openAdd} className="mt-4 gap-2">
                  <Plus className="w-4 h-4" /> Tambah Departemen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map(dept => {
                const txCount = txCountByDept[dept.id] ?? 0;
                return (
                  <Card key={dept.id} className="overflow-hidden group hover:shadow-md transition-shadow">
                    <div className="h-1.5" style={{ backgroundColor: dept.color }} />
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: dept.color + '22' }}>
                            <Building2 className="w-4 h-4" style={{ color: dept.color }} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{dept.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {txCount > 0 ? `${txCount} transaksi` : 'Belum ada transaksi'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(dept)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => openDelete(dept)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Color swatch */}
                      <div className="flex items-center gap-2 mt-3">
                        <div className="w-5 h-5 rounded-md border border-border/50" style={{ backgroundColor: dept.color }} />
                        <span className="font-mono text-xs text-muted-foreground">{dept.color}</span>
                        <span
                          className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: dept.color }}
                        >
                          {dept.name}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Dialog: Tambah / Edit Dept ────────────────────────────────── */}
      <DeptDialog
        open={deptDialogOpen}
        dept={editingDept}
        onClose={() => { setDeptDialogOpen(false); setEditingDept(null); }}
        onSave={handleSaveDept}
        saving={deptSaving}
      />

      {/* ── Dialog: Konfirmasi Hapus ──────────────────────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={v => { if (!v) { setDeleteDialogOpen(false); setDeletingDept(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Hapus Departemen
            </DialogTitle>
            <DialogDescription>
              Aksi ini tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          {deletingDept && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: deletingDept.color }} />
                <span className="font-semibold">{deletingDept.name}</span>
              </div>
              {(txCountByDept[deletingDept.id] ?? 0) > 0 && (
                <div className="flex items-start gap-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    Departemen ini memiliki <strong>{txCountByDept[deletingDept.id]}</strong> transaksi.
                    Hapus semua transaksinya terlebih dahulu.
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeletingDept(null); }}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteDept}
              disabled={(txCountByDept[deletingDept?.id ?? ''] ?? 0) > 0}
            >
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
