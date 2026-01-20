import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { ScrollText, Search, Eye, Filter, Calendar, User, Loader2, RefreshCw } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-500/10 text-green-500 border-green-500/20',
  UPDATE: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  DELETE: 'bg-red-500/10 text-red-500 border-red-500/20',
  LOGIN: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  LOGOUT: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  APPROVE: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  REJECT: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  IMPORT: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  EXPORT: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  PAYMENT: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
};

export default function AuditLogsPage() {
  const { t, language } = useLanguage();
  const { toast } = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const entityTypes = ['ap_invoices', 'ar_invoices', 'ap_payments', 'ar_receipts', 'vendors', 'customers', 'users', 'billing_letters'];
  const actionTypes = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT', 'IMPORT', 'EXPORT', 'PAYMENT'];

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load audit logs',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.actor_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesEntity = entityFilter === 'all' || log.entity_type === entityFilter;
    
    return matchesSearch && matchesAction && matchesEntity;
  });

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setIsDetailOpen(true);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd MMM yyyy, HH:mm:ss', {
      locale: language === 'id' ? idLocale : undefined,
    });
  };

  const formatJson = (data: unknown) => {
    if (!data) return '-';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ScrollText className="w-6 h-6" />
            {t('menu.auditLogs')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('auditLogs.description') || 'Track all system activities and changes'}
          </p>
        </div>
        <Button variant="outline" onClick={fetchLogs} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('auditLogs.searchPlaceholder') || 'Search logs...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t('auditLogs.filterAction') || 'Filter by action'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all') || 'All Actions'}</SelectItem>
                {actionTypes.map(action => (
                  <SelectItem key={action} value={action}>{action}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t('auditLogs.filterEntity') || 'Filter by entity'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all') || 'All Entities'}</SelectItem>
                {entityTypes.map(entity => (
                  <SelectItem key={entity} value={entity}>{entity}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{t('auditLogs.recentActivity') || 'Recent Activity'}</span>
            <Badge variant="secondary">{filteredLogs.length} records</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {t('auditLogs.timestamp') || 'Timestamp'}
                      </div>
                    </TableHead>
                    <TableHead>{t('auditLogs.action') || 'Action'}</TableHead>
                    <TableHead>{t('auditLogs.entity') || 'Entity'}</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {t('auditLogs.actor') || 'Actor'}
                      </div>
                    </TableHead>
                    <TableHead>{t('auditLogs.role') || 'Role'}</TableHead>
                    <TableHead className="w-[100px]">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t('auditLogs.noLogs') || 'No audit logs found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">
                          {formatDate(log.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={actionColors[log.action] || 'bg-gray-500/10 text-gray-500'}
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{log.entity_type || '-'}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {log.entity_id || '-'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[150px]">
                          {log.actor_id}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {log.actor_role}
                          </Badge>
                          {log.is_super_admin_action && (
                            <Badge variant="destructive" className="ml-1 text-xs">
                              SA
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(log)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="w-5 h-5" />
              {t('auditLogs.logDetails') || 'Audit Log Details'}
            </DialogTitle>
            <DialogDescription>
              {selectedLog && formatDate(selectedLog.created_at)}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('auditLogs.action')}</p>
                    <Badge className={actionColors[selectedLog.action] || ''}>
                      {selectedLog.action}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('auditLogs.role')}</p>
                    <Badge variant="secondary">{selectedLog.actor_role}</Badge>
                    {selectedLog.is_super_admin_action && (
                      <Badge variant="destructive" className="ml-1">Super Admin Action</Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('auditLogs.entity')}</p>
                    <p className="font-medium">{selectedLog.entity_type || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Entity ID</p>
                    <p className="font-mono text-xs break-all">{selectedLog.entity_id || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">{t('auditLogs.actor')}</p>
                    <p className="font-mono text-xs break-all">{selectedLog.actor_id}</p>
                  </div>
                  {selectedLog.reason && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">{t('auditLogs.reason') || 'Reason'}</p>
                      <p className="text-sm">{selectedLog.reason}</p>
                    </div>
                  )}
                </div>

                {/* Before Data */}
                {selectedLog.before_data && (
                  <div>
                    <p className="text-sm font-medium mb-2 text-muted-foreground">
                      {t('auditLogs.beforeData') || 'Before Data'}
                    </p>
                    <pre className="bg-red-500/5 border border-red-500/20 p-4 rounded-lg overflow-x-auto text-xs">
                      {formatJson(selectedLog.before_data)}
                    </pre>
                  </div>
                )}

                {/* After Data */}
                {selectedLog.after_data && (
                  <div>
                    <p className="text-sm font-medium mb-2 text-muted-foreground">
                      {t('auditLogs.afterData') || 'After Data'}
                    </p>
                    <pre className="bg-green-500/5 border border-green-500/20 p-4 rounded-lg overflow-x-auto text-xs">
                      {formatJson(selectedLog.after_data)}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
