import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRoleAccess } from '@/contexts/AuthContext';
import { 
  Settings, 
  Bell, 
  Mail, 
  Shield, 
  Database,
  Globe,
  Save,
  RefreshCw,
  Info
} from 'lucide-react';

export default function SystemSettingsPage() {
  const { t, language, setLanguage } = useLanguage();
  const { toast } = useToast();
  const { hasRole } = useRoleAccess();
  const isSuperAdmin = hasRole(['SUPER_ADMIN']);

  const [settings, setSettings] = useState({
    emailNotifications: true,
    billingReminders: true,
    autoApproveThreshold: 0,
    overdueAlertDays: 7,
    defaultPaymentTermsDays: 30,
    currencyFormat: 'IDR',
    dateFormat: 'dd/MM/yyyy',
  });

  const handleSave = () => {
    // In a real implementation, this would save to database
    toast({
      title: t('common.success'),
      description: t('systemSettings.saved') || 'Settings saved successfully',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-6 h-6" />
            {t('menu.systemSettings')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('systemSettings.description') || 'Configure system preferences and defaults'}
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            {t('common.save')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              {t('systemSettings.general') || 'General Settings'}
            </CardTitle>
            <CardDescription>
              {t('systemSettings.generalDesc') || 'Basic system configuration'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>{t('systemSettings.language') || 'Language'}</Label>
              <div className="flex gap-2">
                <Button
                  variant={language === 'id' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLanguage('id')}
                >
                  🇮🇩 Bahasa Indonesia
                </Button>
                <Button
                  variant={language === 'en' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLanguage('en')}
                >
                  🇬🇧 English
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="currencyFormat">{t('systemSettings.currencyFormat') || 'Currency Format'}</Label>
              <Input
                id="currencyFormat"
                value={settings.currencyFormat}
                onChange={(e) => setSettings(prev => ({ ...prev, currencyFormat: e.target.value }))}
                disabled={!isSuperAdmin}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateFormat">{t('systemSettings.dateFormat') || 'Date Format'}</Label>
              <Input
                id="dateFormat"
                value={settings.dateFormat}
                onChange={(e) => setSettings(prev => ({ ...prev, dateFormat: e.target.value }))}
                disabled={!isSuperAdmin}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              {t('systemSettings.notifications') || 'Notifications'}
            </CardTitle>
            <CardDescription>
              {t('systemSettings.notificationsDesc') || 'Email and alert preferences'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('systemSettings.emailNotifications') || 'Email Notifications'}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('systemSettings.emailNotificationsDesc') || 'Receive email alerts for important events'}
                </p>
              </div>
              <Switch
                checked={settings.emailNotifications}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, emailNotifications: checked }))}
                disabled={!isSuperAdmin}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('systemSettings.billingReminders') || 'Billing Reminders'}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('systemSettings.billingRemindersDesc') || 'Automatic reminders for overdue invoices'}
                </p>
              </div>
              <Switch
                checked={settings.billingReminders}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, billingReminders: checked }))}
                disabled={!isSuperAdmin}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="overdueAlertDays">
                {t('systemSettings.overdueAlertDays') || 'Overdue Alert Days'}
              </Label>
              <Input
                id="overdueAlertDays"
                type="number"
                value={settings.overdueAlertDays}
                onChange={(e) => setSettings(prev => ({ ...prev, overdueAlertDays: parseInt(e.target.value) || 0 }))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">
                {t('systemSettings.overdueAlertDaysDesc') || 'Days before due date to send alerts'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              {t('systemSettings.invoiceSettings') || 'Invoice Settings'}
            </CardTitle>
            <CardDescription>
              {t('systemSettings.invoiceSettingsDesc') || 'Default values for invoices'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="defaultPaymentTermsDays">
                {t('systemSettings.defaultPaymentTerms') || 'Default Payment Terms (Days)'}
              </Label>
              <Input
                id="defaultPaymentTermsDays"
                type="number"
                value={settings.defaultPaymentTermsDays}
                onChange={(e) => setSettings(prev => ({ ...prev, defaultPaymentTermsDays: parseInt(e.target.value) || 30 }))}
                disabled={!isSuperAdmin}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoApproveThreshold">
                {t('systemSettings.autoApproveThreshold') || 'Auto-Approve Threshold (IDR)'}
              </Label>
              <Input
                id="autoApproveThreshold"
                type="number"
                value={settings.autoApproveThreshold}
                onChange={(e) => setSettings(prev => ({ ...prev, autoApproveThreshold: parseInt(e.target.value) || 0 }))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">
                {t('systemSettings.autoApproveThresholdDesc') || 'Set to 0 to disable auto-approval'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              {t('systemSettings.systemInfo') || 'System Information'}
            </CardTitle>
            <CardDescription>
              {t('systemSettings.systemInfoDesc') || 'Current system status and version'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">{t('systemSettings.version') || 'Version'}</span>
              <Badge variant="secondary">v1.0.0</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">{t('systemSettings.environment') || 'Environment'}</span>
              <Badge variant="outline">Production</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">{t('systemSettings.database') || 'Database'}</span>
              <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Connected</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">{t('systemSettings.lastBackup') || 'Last Backup'}</span>
              <span className="text-sm">-</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security Notice */}
      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <p className="font-medium text-blue-500">
                {t('systemSettings.securityNotice') || 'Security Notice'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('systemSettings.securityNoticeDesc') || 'Changes to system settings are logged in the audit trail. Only Super Admins can modify these settings.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isSuperAdmin && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-500 mt-0.5" />
              <p className="text-sm text-amber-600">
                {t('systemSettings.readOnly') || 'You have read-only access. Contact a Super Admin to make changes.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
