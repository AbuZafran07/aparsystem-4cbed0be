import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
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
  Wifi,
  WifiOff,
  Activity,
  Bell,
  Zap,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { TablePagination } from '@/components/TablePagination';

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

type ConnectionStatus = 'checking' | 'online' | 'offline' | 'error';

const ITEMS_PER_PAGE = 10;

export default function IntegrationSettingsPage() {
  const { t } = useLanguage();
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isTesting, setIsTesting] = useState(false);

  // Real-time monitoring state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [recentFailures, setRecentFailures] = useState<SyncLog[]>([]);
  const [failureAlertDismissed, setFailureAlertDismissed] = useState(false);
  const [syncRateInfo, setSyncRateInfo] = useState({ today: 0, successRate: 0 });
  const healthCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || '';
  const endpointUrl = `https://${projectId}.supabase.co/functions/v1/wms-sync`;

  // --- Health Check ---
  const checkEndpointHealth = useCallback(async () => {
    setConnectionStatus('checking');
    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'ping', action: 'test', data: {} }),
      });
      // 401 means endpoint is alive and protected (expected)
      if (response.status === 401 || response.ok) {
        setConnectionStatus('online');
      } else {
        setConnectionStatus('error');
      }
    } catch {
      setConnectionStatus('offline');
    }
    setLastCheckTime(new Date());
  }, [endpointUrl]);

  // --- Fetch logs ---
  const fetchSyncLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .or('action.ilike.%WMS%,action.ilike.%SYNC%')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      const logs = (data as SyncLog[]) || [];
      setSyncLogs(logs);

      // Extract recent failures (last 24h)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const failures = logs.filter(l => {
        const d = l.after_data as any;
        return d && d.failed > 0 && l.created_at > oneDayAgo;
      });
      setRecentFailures(failures);

      // Calculate sync rate for today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayLogs = logs.filter(l => l.created_at >= todayStart.toISOString());
      const todaySuccess = todayLogs.filter(l => {
        const d = l.after_data as any;
        return d && (d.failed === 0 || d.failed === undefined);
      }).length;
      setSyncRateInfo({
        today: todayLogs.length,
        successRate: todayLogs.length > 0 ? Math.round((todaySuccess / todayLogs.length) * 100) : 100,
      });
    } catch (err) {
      console.error('Error fetching sync logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- Initial load + periodic health check ---
  useEffect(() => {
    fetchSyncLogs();
    checkEndpointHealth();

    // Health check every 60 seconds
    healthCheckInterval.current = setInterval(checkEndpointHealth, 60000);
    return () => {
      if (healthCheckInterval.current) clearInterval(healthCheckInterval.current);
    };
  }, [fetchSyncLogs, checkEndpointHealth]);

  // --- Realtime subscription on audit_logs ---
  useEffect(() => {
    const channel = supabase
      .channel('wms-sync-monitor')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
        },
        (payload) => {
          const newLog = payload.new as SyncLog;
          // Only process WMS-related logs
          if (
            newLog.action?.toUpperCase().includes('WMS') ||
            newLog.action?.toUpperCase().includes('SYNC')
          ) {
            setSyncLogs(prev => [newLog, ...prev].slice(0, 100));

            const afterData = newLog.after_data as any;
            if (afterData?.failed > 0) {
              setRecentFailures(prev => [newLog, ...prev]);
              setFailureAlertDismissed(false);
              toast.error(
                `⚠️ Sinkronisasi gagal: ${newLog.entity_type || 'unknown'} - ${afterData.failed} error(s)`,
                { duration: 8000 }
              );
            } else {
              toast.success(
                `✅ Sinkronisasi berhasil: ${newLog.entity_type || 'data'} (${afterData?.success || 0} record)`,
                { duration: 5000 }
              );
            }

            // Update today stats
            setSyncRateInfo(prev => {
              const newToday = prev.today + 1;
              const wasSuccess = !afterData?.failed || afterData.failed === 0;
              const prevSuccessCount = Math.round((prev.successRate / 100) * prev.today);
              const newSuccessCount = prevSuccessCount + (wasSuccess ? 1 : 0);
              return {
                today: newToday,
                successRate: Math.round((newSuccessCount / newToday) * 100),
              };
            });
          }
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'ping', action: 'test', data: {} }),
      });

      const body = await response.json().catch(() => ({}));

      if (response.status === 401) {
        setConnectionStatus('online');
        toast.success('✅ Endpoint aktif dan terlindungi! (401 = API key required — ini normal untuk test tanpa key)');
      } else if (response.ok) {
        setConnectionStatus('online');
        toast.success('✅ Koneksi endpoint berhasil!');
      } else {
        setConnectionStatus('error');
        toast.info(`Endpoint merespons dengan status ${response.status}: ${body?.error || 'Unknown'}`);
      }
    } catch {
      setConnectionStatus('offline');
      toast.error('❌ Gagal terhubung ke endpoint WMS. Pastikan function sudah di-deploy.');
    } finally {
      setIsTesting(false);
      setLastCheckTime(new Date());
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
    plan_order: FileText,
  };

  const connectionStatusConfig: Record<ConnectionStatus, { label: string; icon: React.ElementType; color: string; bgColor: string; dotColor: string }> = {
    checking: { label: 'Memeriksa...', icon: RefreshCw, color: 'text-muted-foreground', bgColor: 'bg-muted', dotColor: 'bg-muted-foreground' },
    online: { label: 'Online', icon: Wifi, color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', dotColor: 'bg-emerald-500' },
    offline: { label: 'Offline', icon: WifiOff, color: 'text-destructive', bgColor: 'bg-destructive/10', dotColor: 'bg-destructive' },
    error: { label: 'Error', icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-950/30', dotColor: 'bg-amber-500' },
  };

  const statusCfg = connectionStatusConfig[connectionStatus];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-6">
      {/* Failure Alert Banner */}
      {recentFailures.length > 0 && !failureAlertDismissed && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="flex items-center justify-between">
            <span>⚠️ Sinkronisasi Gagal Terdeteksi</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setFailureAlertDismissed(true)}
            >
              Tutup
            </Button>
          </AlertTitle>
          <AlertDescription className="mt-1">
            <span className="font-medium">{recentFailures.length} sinkronisasi gagal</span> dalam 24 jam terakhir.{' '}
            {recentFailures[0] && (
              <span>
                Terakhir: <span className="font-mono text-xs">{recentFailures[0].entity_type}</span> pada{' '}
                {formatDate(recentFailures[0].created_at)}.{' '}
                {(() => {
                  const d = recentFailures[0].after_data as any;
                  return d?.errors?.length > 0 ? `Error: ${d.errors[0]}` : '';
                })()}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Header with Connection Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrasi WMS</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola konfigurasi dan monitor sinkronisasi dengan Warehouse Management System
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Realtime indicator */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`inline-block w-2 h-2 rounded-full ${realtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
            {realtimeConnected ? 'Live' : 'Disconnected'}
          </div>
          <Button onClick={handleTestConnection} disabled={isTesting} variant="outline" className="gap-2">
            <Globe className="w-4 h-4" />
            {isTesting ? 'Testing...' : 'Test Koneksi'}
          </Button>
        </div>
      </div>

      {/* Connection Status + Monitoring Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Connection Status Card */}
        <Card className={`border-2 ${connectionStatus === 'online' ? 'border-emerald-200 dark:border-emerald-800' : connectionStatus === 'offline' ? 'border-destructive/30' : 'border-border'}`}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${statusCfg.bgColor}`}>
                <StatusIcon className={`w-5 h-5 ${statusCfg.color} ${connectionStatus === 'checking' ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusCfg.dotColor} ${connectionStatus === 'online' ? 'animate-pulse' : ''}`} />
                  <p className={`text-lg font-bold ${statusCfg.color}`}>{statusCfg.label}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {lastCheckTime
                    ? `Dicek ${formatDistanceToNow(lastCheckTime, { locale: idLocale, addSuffix: true })}`
                    : 'Status Endpoint'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Sync */}
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

        {/* Success */}
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

        {/* Failed */}
        <Card className={summary.failed > 0 ? 'border-destructive/30' : ''}>
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

        {/* Today's rate */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10">
                <Activity className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-2xl font-bold text-foreground">{syncRateInfo.today}</p>
                  <span className="text-xs text-muted-foreground">
                    ({syncRateInfo.successRate}%
                    {syncRateInfo.successRate >= 90 ? (
                      <TrendingUp className="inline w-3 h-3 ml-0.5 text-emerald-500" />
                    ) : (
                      <TrendingDown className="inline w-3 h-3 ml-0.5 text-destructive" />
                    )}
                    )
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Hari Ini</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last Sync Info Bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-muted/50 border text-sm">
        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Sync terakhir:</span>
        <span className="font-medium text-foreground">
          {summary.lastSync
            ? `${formatDate(summary.lastSync)} (${formatDistanceToNow(new Date(summary.lastSync), { locale: idLocale, addSuffix: true })})`
            : 'Belum ada sinkronisasi'}
        </span>
        {realtimeConnected && (
          <Badge variant="outline" className="ml-auto gap-1 text-xs">
            <Zap className="w-3 h-3 text-emerald-500" /> Real-time aktif
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="monitoring" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monitoring" className="gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Monitoring
          </TabsTrigger>
          <TabsTrigger value="config">Konfigurasi API</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoint</TabsTrigger>
          <TabsTrigger value="logs">Log Sinkronisasi</TabsTrigger>
        </TabsList>

        {/* Monitoring Tab */}
        <TabsContent value="monitoring">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Activity Feed */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="w-4 h-4" /> Aktivitas Terbaru
                </CardTitle>
                <CardDescription>10 sinkronisasi terakhir secara real-time</CardDescription>
              </CardHeader>
              <CardContent>
                {syncLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Server className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm">Menunggu aktivitas dari WMS...</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px] pr-3">
                    <div className="space-y-3">
                      {syncLogs.slice(0, 10).map((log) => {
                        const afterData = log.after_data as any;
                        const isFailed = afterData?.failed > 0;
                        const EntityIcon = entityIcons[log.entity_type || ''] || ArrowUpDown;
                        return (
                          <div
                            key={log.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                              isFailed ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card hover:bg-muted/50'
                            }`}
                          >
                            <div className={`p-1.5 rounded-lg shrink-0 ${isFailed ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                              <EntityIcon className={`w-4 h-4 ${isFailed ? 'text-destructive' : 'text-primary'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-medium capitalize">{log.entity_type || 'unknown'}</span>
                                {getStatusBadge(log)}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {afterData?.success !== undefined && `${afterData.success} berhasil`}
                                {afterData?.failed > 0 && `, ${afterData.failed} gagal`}
                                {afterData?.invoices_created?.length > 0 && ` • ${afterData.invoices_created.join(', ')}`}
                              </p>
                              {isFailed && afterData?.errors?.[0] && (
                                <p className="text-xs text-destructive mt-1 truncate">
                                  ❌ {afterData.errors[0]}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(log.created_at), { locale: idLocale, addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Failure Details */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="w-4 h-4 text-destructive" /> Alert Kegagalan (24 Jam)
                </CardTitle>
                <CardDescription>
                  {recentFailures.length > 0
                    ? `${recentFailures.length} kegagalan terdeteksi`
                    : 'Tidak ada kegagalan dalam 24 jam terakhir'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recentFailures.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <CheckCircle2 className="w-10 h-10 mb-2 text-emerald-500 opacity-50" />
                    <p className="text-sm font-medium text-emerald-600">Semua Baik!</p>
                    <p className="text-xs mt-1">Tidak ada error dalam 24 jam terakhir</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px] pr-3">
                    <div className="space-y-3">
                      {recentFailures.map((log) => {
                        const afterData = log.after_data as any;
                        return (
                          <div
                            key={log.id}
                            className="p-3 rounded-lg border border-destructive/30 bg-destructive/5"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <Badge variant="destructive" className="text-xs">
                                {log.entity_type || 'unknown'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(log.created_at)}
                              </span>
                            </div>
                            <div className="text-sm text-foreground">
                              {afterData?.failed} gagal dari {(afterData?.success || 0) + (afterData?.failed || 0)} total
                            </div>
                            {afterData?.errors?.map((err: string, idx: number) => (
                              <div key={idx} className="text-xs text-destructive mt-1 font-mono break-all">
                                • {err}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

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
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Endpoint URL</label>
                <div className="flex gap-2">
                  <Input value={endpointUrl} readOnly className="font-mono text-sm bg-muted" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(endpointUrl)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
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
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10"><Users className="w-5 h-5 text-primary" /></div>
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
                    entity: "customer", action: "upsert",
                    data: { customer_name: "Nama Customer", address: "Alamat (opsional)", phone: "Telepon (opsional)", billing_email: "email@example.com (opsional)" }
                  }, null, 2)}</pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10"><Building2 className="w-5 h-5 text-primary" /></div>
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
                    entity: "vendor", action: "upsert",
                    data: { vendor_name: "Nama Vendor", address: "Alamat (opsional)", phone: "Telepon (opsional)", email: "email@example.com (opsional)", bank_name: "Nama Bank (opsional)", bank_account_no: "No. Rekening (opsional)" }
                  }, null, 2)}</pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10"><FileText className="w-5 h-5 text-primary" /></div>
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
                    entity: "sales_order", action: "upsert",
                    data: {
                      customer_name: "Nama Customer (wajib)", order_number: "SO-001 (wajib)", invoice_number: "INV-001 (wajib)",
                      invoice_amount: 1000000, invoice_date: "2026-01-15", sp_po_date: "2026-01-10",
                      sales_name: "Nama Sales (opsional)", payment_terms_name: "NET 30 (opsional)",
                      created_by_email: "user@company.com (opsional)", created_by_name: "Nama User (opsional)",
                      notes: "Catatan (opsional)"
                    }
                  }, null, 2)}</pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10"><FileText className="w-5 h-5 text-primary" /></div>
                  <div>
                    <CardTitle className="text-base">Plan Order → AP Invoice</CardTitle>
                    <CardDescription>Auto-create invoice AP dari Plan Order WMS</CardDescription>
                  </div>
                  <Badge className="ml-auto bg-emerald-600">Aktif</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                  <pre className="text-foreground/80">{JSON.stringify({
                    entity: "plan_order", action: "upsert",
                    data: {
                      vendor_name: "Nama Vendor (wajib)", po_number: "PO-001 (wajib)", vendor_invoice_number: "VINV-001 (wajib)",
                      invoice_amount: 5000000, invoice_date: "2026-01-15", sp_po_date: "2026-01-10",
                      product_name: "Nama Produk (opsional)", payment_terms_name: "NET 30 (opsional)",
                      created_by_email: "user@company.com (opsional)", created_by_name: "Nama User (opsional)",
                      notes: "Catatan (opsional)"
                    }
                  }, null, 2)}</pre>
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted"><Database className="w-5 h-5 text-muted-foreground" /></div>
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
                    entity: "customer", action: "sync_batch",
                    data: [
                      { customer_name: "Customer A", phone: "08123456" },
                      { customer_name: "Customer B", billing_email: "b@mail.com" }
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
                        totalItems={filteredLogs.length}
                        pageSize={ITEMS_PER_PAGE}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={() => {}}
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
