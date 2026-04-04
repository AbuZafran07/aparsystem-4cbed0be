import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Globe,
  Shield,
  Clock,
  ArrowUpDown,
  Copy,
  Eye,
  EyeOff,
  Search,
  Server,
  Database,
  Users,
  Building2,
  FileText,
} from 'lucide-react';
import TablePagination from '@/components/TablePagination';

interface SyncLog {
  id: string;
  action: string;
  entity_type: string | null;
  actor_id: string;
  actor_role: string;
  created_at: string;
  after_data: any;
  before_data: any;
}

const ITEMS_PER_PAGE = 10;

export default function IntegrationSettingsPage() {
  const { t } = useLanguage();
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isTesting, setIsTesting] = useState(false);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || '';
  const endpointUrl = `https://${projectId}.supabase.co/functions/v1/wms-sync`;

  useEffect(() => {
    fetchSyncLogs();
  }, []);

  const fetchSyncLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .or('action.ilike.%WMS%,action.ilike.%SYNC%')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setSyncLogs((data as SyncLog[]) || []);
    } catch (err) {
      console.error('Error fetching sync logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'customer', action: 'upsert', data: {} }),
      });

      if (response.status === 401) {
        toast.success('Endpoint aktif! (401 = API key diperlukan - ini normal)');
      } else if (response.ok) {
        toast.success('Koneksi endpoint berhasil!');
      } else {
        const body = await response.json().catch(() => ({}));
        toast.info(`Endpoint merespons dengan status ${response.status}`);
      }
    } catch (err) {
      toast.error('Gagal terhubung ke endpoint WMS');
    } finally {
      setIsTesting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Berhasil disalin ke clipboard');
  };

  const filteredLogs = syncLogs.filter(log =>
    log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.entity_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd MMM yyyy HH:mm:ss', { locale: idLocale });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (log: SyncLog) => {
    const afterData = log.after_data as any;
    if (afterData?.failed > 0 && afterData?.success === 0) {
      return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Gagal</Badge>;
    }
    if (afterData?.failed > 0) {
      return <Badge className="gap-1 bg-amber-500 hover:bg-amber-600"><AlertTriangle className="w-3 h-3" /> Sebagian</Badge>;
    }
    return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="w-3 h-3" /> Sukses</Badge>;
  };

  const getSyncSummary = () => {
    const total = syncLogs.length;
    const success = syncLogs.filter(l => {
      const d = l.after_data as any;
      return d && (d.failed === 0 || d.failed === undefined);
    }).length;
    const failed = total - success;
    const lastSync = syncLogs[0]?.created_at;

    return { total, success, failed, lastSync };
  };

  const summary = getSyncSummary();

  const entityIcons: Record<string, React.ElementType> = {
    customer: Users,
    vendor: Building2,
    sales_order: FileText,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrasi WMS</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola konfigurasi dan monitor sinkronisasi dengan Warehouse Management System
          </p>
        </div>
        <Button onClick={handleTestConnection} disabled={isTesting} variant="outline" className="gap-2">
          <Globe className="w-4 h-4" />
          {isTesting ? 'Testing...' : 'Test Koneksi'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <ArrowUpDown className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{summary.total}</p>
                <p className="text-xs text-muted-foreground">Total Sinkronisasi</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{summary.success}</p>
                <p className="text-xs text-muted-foreground">Berhasil</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-destructive/10">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{summary.failed}</p>
                <p className="text-xs text-muted-foreground">Gagal</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {summary.lastSync ? formatDate(summary.lastSync) : '-'}
                </p>
                <p className="text-xs text-muted-foreground">Sync Terakhir</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="config" className="space-y-4">
        <TabsList>
          <TabsTrigger value="config">Konfigurasi API</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoint</TabsTrigger>
          <TabsTrigger value="logs">Log Sinkronisasi</TabsTrigger>
        </TabsList>

        {/* Config Tab */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" /> Konfigurasi API
              </CardTitle>
              <CardDescription>
                Informasi endpoint dan autentikasi untuk integrasi WMS
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Endpoint URL */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Endpoint URL</label>
                <div className="flex gap-2">
                  <Input value={endpointUrl} readOnly className="font-mono text-sm bg-muted" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(endpointUrl)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API Key (Header: x-api-key)</label>
                <div className="flex gap-2">
                  <Input
                    value={showApiKey ? 'Disimpan sebagai secret WMS_API_KEY' : '••••••••••••••••••••••••'}
                    readOnly
                    className="font-mono text-sm bg-muted"
                    type={showApiKey ? 'text' : 'password'}
                  />
                  <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  API Key disimpan sebagai secret dan tidak dapat dilihat di sini. Hubungi administrator untuk mendapatkan kunci.
                </p>
              </div>

              {/* Method & Auth */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">HTTP Method</label>
                  <Input value="POST" readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Autentikasi</label>
                  <Input value="API Key (Header: x-api-key)" readOnly className="bg-muted" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Endpoints Tab */}
        <TabsContent value="endpoints">
          <div className="grid gap-4">
            {/* Customer Sync */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Sinkronisasi Customer</CardTitle>
                    <CardDescription>Upsert data customer dari WMS</CardDescription>
                  </div>
                  <Badge className="ml-auto bg-emerald-600">Aktif</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                  <pre className="text-foreground/80">{JSON.stringify({
                    entity: "customer",
                    action: "upsert",
                    data: {
                      name: "Nama Customer",
                      address: "Alamat (opsional)",
                      phone: "Telepon (opsional)",
                      billing_email: "email@example.com (opsional)"
                    }
                  }, null, 2)}</pre>
                </div>
              </CardContent>
            </Card>

            {/* Vendor Sync */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Sinkronisasi Vendor</CardTitle>
                    <CardDescription>Upsert data vendor dari WMS</CardDescription>
                  </div>
                  <Badge className="ml-auto bg-emerald-600">Aktif</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                  <pre className="text-foreground/80">{JSON.stringify({
                    entity: "vendor",
                    action: "upsert",
                    data: {
                      name: "Nama Vendor",
                      address: "Alamat (opsional)",
                      phone: "Telepon (opsional)",
                      email: "email@example.com (opsional)",
                      bank_name: "Nama Bank (opsional)",
                      bank_account_no: "No. Rekening (opsional)"
                    }
                  }, null, 2)}</pre>
                </div>
              </CardContent>
            </Card>

            {/* Sales Order → AR Invoice */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Sales Order → AR Invoice</CardTitle>
                    <CardDescription>Auto-create invoice AR dari Sales Order WMS</CardDescription>
                  </div>
                  <Badge className="ml-auto bg-emerald-600">Aktif</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                  <pre className="text-foreground/80">{JSON.stringify({
                    entity: "sales_order",
                    action: "upsert",
                    data: {
                      customer_name: "Nama Customer (wajib)",
                      order_number: "SO-001 (wajib)",
                      invoice_number: "INV-001 (wajib)",
                      invoice_amount: 1000000,
                      invoice_date: "2026-01-15",
                      sp_po_date: "2026-01-10",
                      sales_name: "Nama Sales (opsional)",
                      payment_terms_name: "NET 30 (opsional)",
                      notes: "Catatan (opsional)"
                    }
                  }, null, 2)}</pre>
                </div>
              </CardContent>
            </Card>

            {/* Batch Sync */}
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Database className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Batch Sync</CardTitle>
                    <CardDescription>Kirim banyak data sekaligus dengan action "sync_batch"</CardDescription>
                  </div>
                  <Badge variant="outline" className="ml-auto">Tersedia</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                  <pre className="text-foreground/80">{JSON.stringify({
                    entity: "customer",
                    action: "sync_batch",
                    data: [
                      { name: "Customer A", phone: "08123456" },
                      { name: "Customer B", billing_email: "b@mail.com" }
                    ]
                  }, null, 2)}</pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <CardTitle>Log Sinkronisasi</CardTitle>
                  <CardDescription>Riwayat aktivitas sinkronisasi WMS</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Cari log..."
                      value={searchTerm}
                      onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                      className="pl-9 w-64"
                    />
                  </div>
                  <Button variant="outline" size="icon" onClick={fetchSyncLogs}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Server className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-medium">Belum ada log sinkronisasi</p>
                  <p className="text-sm">Log akan muncul setelah WMS mengirim data ke endpoint</p>
                </div>
              ) : (
                <>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Waktu</TableHead>
                          <TableHead>Aksi</TableHead>
                          <TableHead>Entitas</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Detail</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedLogs.map(log => {
                          const afterData = log.after_data as any;
                          const EntityIcon = entityIcons[log.entity_type || ''] || ArrowUpDown;
                          return (
                            <TableRow key={log.id}>
                              <TableCell className="text-sm whitespace-nowrap">
                                {formatDate(log.created_at)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-mono text-xs">
                                  {log.action}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <EntityIcon className="w-4 h-4 text-muted-foreground" />
                                  <span className="capitalize">{log.entity_type || '-'}</span>
                                </div>
                              </TableCell>
                              <TableCell>{getStatusBadge(log)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {afterData ? (
                                  <span>
                                    {afterData.success !== undefined && `✓ ${afterData.success}`}
                                    {afterData.failed !== undefined && ` ✗ ${afterData.failed}`}
                                    {afterData.invoices_created && ` | INV: ${afterData.invoices_created.join(', ')}`}
                                  </span>
                                ) : '-'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {totalPages > 1 && (
                    <div className="mt-4">
                      <TablePagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        totalItems={filteredLogs.length}
                        itemsPerPage={ITEMS_PER_PAGE}
                      />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
