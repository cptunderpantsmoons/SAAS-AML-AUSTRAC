'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import {
  Settings,
  ShieldAlert,
  Bell,
  Plug,
  Database,
  Save,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  TestTube,
  AlertTriangle,
  Info,
  Users,
  Shield,
  Mail,
  MoreHorizontal,
  UserPlus,
  Search,
  Cpu,
  Scroll,
  ClipboardList,
  RefreshCw,
  Filter,
  Activity,
  Zap,
  Server,
  HardDrive,
  FileSearch,
  BellRing,
  Brain,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle,
  XCircleIcon,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// ─── localStorage helpers ───────────────────────────────────────────────────────

function getSetting<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(`aml-ctf-settings-${key}`);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setSetting<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`aml-ctf-settings-${key}`, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

// ─── Provider types ─────────────────────────────────────────────────────────────

interface Provider {
  name: string;
  status: 'connected' | 'disconnected';
  lastSync: string;
  description: string;
}

const DEFAULT_PROVIDERS: Provider[] = [
  { name: 'Veriff', status: 'connected', lastSync: new Date(Date.now() - 120000).toISOString(), description: 'Identity verification & document authentication' },
  { name: 'OpenSanctions', status: 'connected', lastSync: new Date(Date.now() - 3600000).toISOString(), description: 'Sanctions & PEP screening database' },
  { name: 'Kyckr', status: 'disconnected', lastSync: new Date(Date.now() - 86400000).toISOString(), description: 'Corporate registry & UBO identification' },
  { name: 'AU10TIX', status: 'connected', lastSync: new Date(Date.now() - 7200000).toISOString(), description: 'Document forgery detection & liveness' },
];

// ─── Main Component ─────────────────────────────────────────────────────────────

export function SettingsSection() {
  return (
    <div className="space-y-6">
      <SectionHeader title="Settings" description="Platform configuration & integrations" icon={Settings} />

      <Tabs defaultValue="risk" className="space-y-6">
        <div className="w-full overflow-x-auto -mx-1 px-1">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid lg:grid-cols-8 min-w-[640px] gap-1">
            <TabsTrigger value="risk" className="gap-1.5 text-xs">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Risk Config</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5 text-xs">
              <Bell className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1.5 text-xs">
              <Plug className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">API Integration</span>
            </TabsTrigger>
            <TabsTrigger value="retention" className="gap-1.5 text-xs">
              <Database className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Data Retention</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
            <TabsTrigger value="system-health" className="gap-1.5 text-xs">
              <Cpu className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">System Health</span>
            </TabsTrigger>
            <TabsTrigger value="compliance-policy" className="gap-1.5 text-xs">
              <Scroll className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Compliance Policy</span>
            </TabsTrigger>
            <TabsTrigger value="audit-log" className="gap-1.5 text-xs">
              <ClipboardList className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Audit Log</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="risk">
          <RiskConfigurationTab />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationPreferencesTab />
        </TabsContent>
        <TabsContent value="integrations">
          <APIIntegrationTab />
        </TabsContent>
        <TabsContent value="retention">
          <DataRetentionTab />
        </TabsContent>
        <TabsContent value="users">
          <UserManagementTab />
        </TabsContent>
        <TabsContent value="system-health">
          <SystemHealthMonitorTab />
        </TabsContent>
        <TabsContent value="compliance-policy">
          <CompliancePolicyConfigTab />
        </TabsContent>
        <TabsContent value="audit-log">
          <AuditChangeLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Risk Configuration Tab ────────────────────────────────────────────────────

function RiskConfigurationTab() {
  const [riskAppetite, setRiskAppetite] = useState(() => getSetting('riskAppetite', 25));
  const [mediumToHighHours, setMediumToHighHours] = useState(() => getSetting('mediumToHighHours', 24));
  const [highToCriticalHours, setHighToCriticalHours] = useState(() => getSetting('highToCriticalHours', 4));
  const [autoEscalation, setAutoEscalation] = useState(() => getSetting('autoEscalation', true));
  const [docRiskThreshold, setDocRiskThreshold] = useState(() => getSetting('docRiskThreshold', 50));
  const [hasChanges, setHasChanges] = useState(false);

  const markChanged = useCallback(() => setHasChanges(true), []);

  const handleSave = () => {
    setSetting('riskAppetite', riskAppetite);
    setSetting('mediumToHighHours', mediumToHighHours);
    setSetting('highToCriticalHours', highToCriticalHours);
    setSetting('autoEscalation', autoEscalation);
    setSetting('docRiskThreshold', docRiskThreshold);
    setHasChanges(false);
    toast.success('Risk configuration saved');
  };

  const handleReset = () => {
    setRiskAppetite(25);
    setMediumToHighHours(24);
    setHighToCriticalHours(4);
    setAutoEscalation(true);
    setDocRiskThreshold(50);
    setHasChanges(true);
    toast.info('Reset to defaults — click Save to apply');
  };

  return (
    <div className="space-y-6">
      {/* Risk Appetite Threshold */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Risk Appetite Threshold</CardTitle>
              <CardDescription className="text-xs">Maximum acceptable risk level before triggering compliance review</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Threshold Level</Label>
            <Badge variant="outline" className="text-xs font-mono">
              {riskAppetite}%
            </Badge>
          </div>
          <Slider
            value={[riskAppetite]}
            onValueChange={([v]) => { setRiskAppetite(v); markChanged(); }}
            max={100}
            step={5}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Conservative (0%)</span>
            <span>Moderate (50%)</span>
            <span>Aggressive (100%)</span>
          </div>
          <div className={`mt-2 p-3 rounded-lg border ${
            riskAppetite > 50
              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
              : riskAppetite > 25
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
          }`}>
            <div className="flex items-center gap-2">
              {riskAppetite > 50 ? (
                <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              ) : riskAppetite > 25 ? (
                <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span className="text-xs font-medium">
                {riskAppetite > 50 ? 'High risk appetite — requires board approval' : riskAppetite > 25 ? 'Moderate risk appetite — additional monitoring recommended' : 'Conservative risk appetite — AUSTRAC compliant'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert Escalation Thresholds */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Alert Escalation Thresholds</CardTitle>
              <CardDescription className="text-xs">Time before alerts automatically escalate to higher severity</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Medium → High Escalation</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={mediumToHighHours}
                  onChange={(e) => { setMediumToHighHours(Number(e.target.value)); markChanged(); }}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">hours</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Alerts unaddressed for this duration escalate from Medium to High</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">High → Critical Escalation</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={72}
                  value={highToCriticalHours}
                  onChange={(e) => { setHighToCriticalHours(Number(e.target.value)); markChanged(); }}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">hours</span>
              </div>
              <p className="text-[10px] text-muted-foreground">High alerts unaddressed for this duration escalate to Critical</p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Auto-Escalation</Label>
              <p className="text-[10px] text-muted-foreground">Automatically escalate alerts based on time thresholds</p>
            </div>
            <Switch
              checked={autoEscalation}
              onCheckedChange={(v) => { setAutoEscalation(v); markChanged(); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Document Risk Score Threshold */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
              <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Document Risk Score Threshold</CardTitle>
              <CardDescription className="text-xs">Risk score percentage above which documents are flagged for review</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Flag Threshold</Label>
            <Badge variant="outline" className="text-xs font-mono">
              {docRiskThreshold}%
            </Badge>
          </div>
          <Slider
            value={[docRiskThreshold]}
            onValueChange={([v]) => { setDocRiskThreshold(v); markChanged(); }}
            max={100}
            step={5}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Lenient (0%)</span>
            <span>Standard (50%)</span>
            <span>Strict (100%)</span>
          </div>
        </CardContent>
      </Card>

      {/* Save / Reset Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to Defaults
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!hasChanges} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          Save Configuration
        </Button>
      </div>
    </div>
  );
}

// ─── Notification Preferences Tab ───────────────────────────────────────────────

function NotificationPreferencesTab() {
  const [emailNewAlerts, setEmailNewAlerts] = useState(() => getSetting('emailNewAlerts', true));
  const [emailCriticalAlerts, setEmailCriticalAlerts] = useState(() => getSetting('emailCriticalAlerts', true));
  const [emailReportApprovals, setEmailReportApprovals] = useState(() => getSetting('emailReportApprovals', false));
  const [emailComplianceDeadlines, setEmailComplianceDeadlines] = useState(() => getSetting('emailComplianceDeadlines', true));
  const [inAppNotifications, setInAppNotifications] = useState(() => getSetting('inAppNotifications', true));
  const [inAppSound, setInAppSound] = useState(() => getSetting('inAppSound', false));
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(() => getSetting('quietHoursEnabled', false));
  const [quietHoursStart, setQuietHoursStart] = useState(() => getSetting('quietHoursStart', '22:00'));
  const [quietHoursEnd, setQuietHoursEnd] = useState(() => getSetting('quietHoursEnd', '07:00'));

  const handleSave = () => {
    setSetting('emailNewAlerts', emailNewAlerts);
    setSetting('emailCriticalAlerts', emailCriticalAlerts);
    setSetting('emailReportApprovals', emailReportApprovals);
    setSetting('emailComplianceDeadlines', emailComplianceDeadlines);
    setSetting('inAppNotifications', inAppNotifications);
    setSetting('inAppSound', inAppSound);
    setSetting('quietHoursEnabled', quietHoursEnabled);
    setSetting('quietHoursStart', quietHoursStart);
    setSetting('quietHoursEnd', quietHoursEnd);
    toast.success('Notification preferences saved');
  };

  return (
    <div className="space-y-6">
      {/* Email Notifications */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/30">
              <Bell className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Email Notifications</CardTitle>
              <CardDescription className="text-xs">Configure which events trigger email notifications</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <NotificationToggle
            label="New Alerts"
            description="Receive email when a new monitoring alert is generated"
            checked={emailNewAlerts}
            onCheckedChange={setEmailNewAlerts}
          />
          <Separator />
          <NotificationToggle
            label="Critical Alerts"
            description="Receive email immediately for critical severity alerts"
            checked={emailCriticalAlerts}
            onCheckedChange={setEmailCriticalAlerts}
          />
          <Separator />
          <NotificationToggle
            label="Report Approvals"
            description="Notify when AUSTRAC reports are approved or rejected"
            checked={emailReportApprovals}
            onCheckedChange={setEmailReportApprovals}
          />
          <Separator />
          <NotificationToggle
            label="Compliance Deadlines"
            description="Reminders for upcoming AUSTRAC reporting deadlines"
            checked={emailComplianceDeadlines}
            onCheckedChange={setEmailComplianceDeadlines}
          />
        </CardContent>
      </Card>

      {/* In-App Notifications */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Info className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">In-App Notifications</CardTitle>
              <CardDescription className="text-xs">Configure in-app notification behavior</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <NotificationToggle
            label="In-App Notifications"
            description="Show notification banners within the platform"
            checked={inAppNotifications}
            onCheckedChange={setInAppNotifications}
          />
          <Separator />
          <NotificationToggle
            label="Notification Sounds"
            description="Play audio alerts for new notifications"
            checked={inAppSound}
            onCheckedChange={setInAppSound}
          />
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                <Clock className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Quiet Hours</CardTitle>
                <CardDescription className="text-xs">Suppress non-critical notifications during specified hours</CardDescription>
              </div>
            </div>
            <Switch
              checked={quietHoursEnabled}
              onCheckedChange={setQuietHoursEnabled}
            />
          </div>
        </CardHeader>
        <CardContent>
          <AnimatePresence>
            {quietHoursEnabled && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Start Time</Label>
                    <Input
                      type="time"
                      value={quietHoursStart}
                      onChange={(e) => setQuietHoursStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">End Time</Label>
                    <Input
                      type="time"
                      value={quietHoursEnd}
                      onChange={(e) => setQuietHoursEnd(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-3">
                  Critical alerts will bypass quiet hours and always notify.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={handleSave} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          Save Preferences
        </Button>
      </div>
    </div>
  );
}

function NotificationToggle({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label className="text-xs font-medium">{label}</Label>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ─── API Integration Tab ────────────────────────────────────────────────────────

function APIIntegrationTab() {
  const [providers, setProviders] = useState<Provider[]>(() => getSetting('providers', DEFAULT_PROVIDERS));
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const formatTimeAgo = (dateStr: string): string => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const handleTestConnection = async (providerName: string) => {
    setTestingProvider(providerName);
    // Simulate connection test
    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000));

    setProviders((prev) =>
      prev.map((p) =>
        p.name === providerName
          ? { ...p, status: Math.random() > 0.2 ? 'connected' : 'disconnected', lastSync: new Date().toISOString() }
          : p
      )
    );
    setTestingProvider(null);

    const provider = providers.find((p) => p.name === providerName);
    if (provider?.status === 'connected' || Math.random() > 0.2) {
      toast.success(`${providerName} connection test passed`);
    } else {
      toast.error(`${providerName} connection test failed`);
    }
  };

  const handleToggleConnection = (providerName: string) => {
    setProviders((prev) =>
      prev.map((p) =>
        p.name === providerName
          ? { ...p, status: p.status === 'connected' ? 'disconnected' : 'connected', lastSync: new Date().toISOString() }
          : p
      )
    );
    setSetting('providers', providers);
    const provider = providers.find((p) => p.name === providerName);
    toast.info(`${providerName} ${provider?.status === 'connected' ? 'disconnected' : 'connected'}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Third-Party Providers</h3>
          <p className="text-xs text-muted-foreground">Manage connections to external compliance service providers</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {providers.filter((p) => p.status === 'connected').length}/{providers.length} Connected
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map((provider, idx) => (
          <motion.div
            key={provider.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1, duration: 0.3 }}
          >
            <Card className={`h-full transition-all duration-300 hover:shadow-md ${
              provider.status === 'connected'
                ? 'border-emerald-200 dark:border-emerald-800'
                : 'border-red-200 dark:border-red-800'
            }`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      provider.status === 'connected'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {provider.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">{provider.name}</h4>
                      <p className="text-[10px] text-muted-foreground">{provider.description}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      provider.status === 'connected'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
                        : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800'
                    }`}
                  >
                    <div className={`h-1.5 w-1.5 rounded-full mr-1 ${
                      provider.status === 'connected' ? 'bg-emerald-500' : 'bg-red-500'
                    }`} />
                    {provider.status === 'connected' ? 'Connected' : 'Disconnected'}
                  </Badge>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Last sync: {formatTimeAgo(provider.lastSync)}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs gap-1.5 h-8"
                    onClick={() => handleTestConnection(provider.name)}
                    disabled={testingProvider === provider.name}
                  >
                    {testingProvider === provider.name ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <TestTube className="h-3 w-3" />
                    )}
                    Test Connection
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1.5 h-8"
                    onClick={() => handleToggleConnection(provider.name)}
                  >
                    {provider.status === 'connected' ? 'Disconnect' : 'Connect'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border">
        <Info className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-[10px] text-muted-foreground">
          API credentials are managed securely and are not displayed here. Contact your system administrator to update API keys or configure new provider connections.
        </p>
      </div>
    </div>
  );
}

// ─── Data Retention Tab ─────────────────────────────────────────────────────────

function DataRetentionTab() {
  const [retentionYears, setRetentionYears] = useState(() => getSetting('retentionYears', 7));
  const [autoPurge, setAutoPurge] = useState(() => getSetting('autoPurge', false));
  const [lastPurgeDate] = useState(() => getSetting('lastPurgeDate', '2026-01-15T00:00:00Z'));

  const handleSave = () => {
    setSetting('retentionYears', retentionYears);
    setSetting('autoPurge', autoPurge);
    toast.success('Data retention settings saved');
  };

  const handlePurgeNow = () => {
    toast.success('Purge simulation started — no records were actually deleted');
    setSetting('lastPurgeDate', new Date().toISOString());
  };

  return (
    <div className="space-y-6">
      {/* Retention Period */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Retention Period</CardTitle>
              <CardDescription className="text-xs">How long to retain compliance records per AUSTRAC requirements</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Retention Duration</Label>
            <Select value={String(retentionYears)} onValueChange={(v) => setRetentionYears(Number(v))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 years</SelectItem>
                <SelectItem value="7">7 years (AUSTRAC default)</SelectItem>
                <SelectItem value="10">10 years</SelectItem>
                <SelectItem value="15">15 years</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-medium">
                AUSTRAC requires minimum 7-year retention under the AML/CTF Act 2006
              </span>
            </div>
            {retentionYears < 7 && (
              <p className="text-[10px] text-red-600 dark:text-red-400 mt-1 ml-5.5">
                ⚠️ Setting below 7 years may result in regulatory non-compliance
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Auto-Purge */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Auto-Purge Expired Records</CardTitle>
              <CardDescription className="text-xs">Automatically delete records past the retention period</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Enable Auto-Purge</Label>
              <p className="text-[10px] text-muted-foreground">Records older than {retentionYears} years will be permanently deleted</p>
            </div>
            <Switch checked={autoPurge} onCheckedChange={setAutoPurge} />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Last Purge Date</Label>
              <p className="text-xs text-muted-foreground">
                {new Date(lastPurgeDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handlePurgeNow}>
              <Database className="h-3 w-3" />
              Simulate Purge
            </Button>
          </div>

          {autoPurge && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                <span className="text-xs font-medium">
                  Auto-purge is enabled — expired records will be permanently deleted. This action cannot be undone.
                </span>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={handleSave} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          Save Retention Settings
        </Button>
      </div>
    </div>
  );
}

// ─── User Management Tab ────────────────────────────────────────────────────────

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: 'Compliance Officer' | 'MLRO' | 'Analyst' | 'Auditor' | 'Admin';
  status: 'active' | 'inactive' | 'suspended';
  lastLogin: string;
  mfaEnabled: boolean;
  department: string;
}

const DEFAULT_USERS: UserRecord[] = [];

const ROLE_COLORS: Record<string, string> = {
  Admin: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  MLRO: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800',
  'Compliance Officer': 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800',
  Analyst: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  Auditor: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ─── Role Permissions Matrix ────────────────────────────────────────────────────

const PERMISSIONS = [
  'View Clients',
  'Edit Clients',
  'View Reports',
  'Generate Reports',
  'Approve Reports',
  'Manage Users',
  'System Config',
  'View Audit Log',
] as const;

type Permission = (typeof PERMISSIONS)[number];

const ROLES = ['Admin', 'MLRO', 'Compliance Officer', 'Analyst', 'Auditor'] as const;

const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  Admin: ['View Clients', 'Edit Clients', 'View Reports', 'Generate Reports', 'Approve Reports', 'Manage Users', 'System Config', 'View Audit Log'],
  MLRO: ['View Clients', 'Edit Clients', 'View Reports', 'Generate Reports', 'Approve Reports', 'Manage Users', 'View Audit Log'],
  'Compliance Officer': ['View Clients', 'Edit Clients', 'View Reports', 'Generate Reports', 'View Audit Log'],
  Analyst: ['View Clients', 'View Reports', 'Generate Reports'],
  Auditor: ['View Clients', 'View Reports', 'View Audit Log'],
};

function RolePermissionsMatrix() {
  const [rolePermissions, setRolePermissions] = useState<Record<string, Permission[]>>(() =>
    getSetting('rolePermissions', DEFAULT_ROLE_PERMISSIONS)
  );

  const togglePermission = (role: string, permission: Permission) => {
    setRolePermissions((prev) => {
      const currentPerms = prev[role] ?? [];
      const newPerms = currentPerms.includes(permission)
        ? currentPerms.filter((p) => p !== permission)
        : [...currentPerms, permission];
      const updated = { ...prev, [role]: newPerms };
      setSetting('rolePermissions', updated);
      return updated;
    });
  };

  const handleSave = () => {
    setSetting('rolePermissions', rolePermissions);
    toast.success('Role permissions saved');
  };

  const handleReset = () => {
    setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
    setSetting('rolePermissions', DEFAULT_ROLE_PERMISSIONS);
    toast.info('Role permissions reset to defaults');
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold min-w-[140px]">Permission</TableHead>
              {ROLES.map((role) => (
                <TableHead key={role} className="text-center min-w-[100px]">
                  <Badge variant="outline" className={`text-[9px] h-5 px-1.5 ${ROLE_COLORS[role] ?? ''}`}>
                    {role}
                  </Badge>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSIONS.map((permission) => (
              <TableRow key={permission}>
                <TableCell className="text-xs font-medium">{permission}</TableCell>
                {ROLES.map((role) => {
                  const hasPermission = (rolePermissions[role] ?? []).includes(permission);
                  return (
                    <TableCell key={`${role}-${permission}`} className="text-center">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={hasPermission}
                          onCheckedChange={() => togglePermission(role, permission)}
                          className={hasPermission ? 'data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600' : ''}
                        />
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border flex-1">
          <Info className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-muted-foreground">
            Changes to role permissions take effect immediately upon save. All permission changes are logged in the audit trail for compliance review.
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 text-xs">
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} className="gap-1.5 text-xs">
            <Save className="h-3 w-3" />
            Save Permissions
          </Button>
        </div>
      </div>
    </div>
  );
}

function UserManagementTab() {
  const [users, setUsers] = useState<UserRecord[]>(DEFAULT_USERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'Analyst' as UserRecord['role'], department: 'Compliance' });

  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const activeCount = users.filter((u) => u.status === 'active').length;
  const mfaCount = users.filter((u) => u.mfaEnabled).length;

  const handleAddUser = () => {
    if (!newUser.name || !newUser.email) return;
    const user: UserRecord = {
      id: `u${Date.now()}`,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      status: 'active',
      lastLogin: new Date().toISOString(),
      mfaEnabled: false,
      department: newUser.department,
    };
    setUsers((prev) => [user, ...prev]);
    setNewUser({ name: '', email: '', role: 'Analyst', department: 'Compliance' });
    setShowAddForm(false);
    toast.success(`User "${user.name}" added successfully`);
  };

  const handleToggleStatus = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, status: u.status === 'active' ? 'suspended' : 'active' }
          : u
      )
    );
    const user = users.find((u) => u.id === userId);
    toast.info(`${user?.name} ${user?.status === 'active' ? 'suspended' : 'reactivated'}`);
  };

  const handleToggleMFA = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, mfaEnabled: !u.mfaEnabled } : u
      )
    );
    const user = users.find((u) => u.id === userId);
    toast.info(`MFA ${user?.mfaEnabled ? 'disabled' : 'enabled'} for ${user?.name}`);
  };

  const formatTimeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-gradient-to-br from-sky-50 via-sky-50/80 to-white dark:from-sky-950/40 dark:via-sky-950/20 dark:to-card border-sky-200 dark:border-sky-800">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Users</span>
          </div>
          <p className="text-2xl font-bold text-sky-700 dark:text-sky-400 mt-1">{users.length}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-emerald-50 via-emerald-50/80 to-white dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-card border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{activeCount}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-violet-50 via-violet-50/80 to-white dark:from-violet-950/40 dark:via-violet-950/20 dark:to-card border-violet-200 dark:border-violet-800">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">MFA Enabled</span>
          </div>
          <p className="text-2xl font-bold text-violet-700 dark:text-violet-400 mt-1">{mfaCount}/{users.length}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-amber-50 via-amber-50/80 to-white dark:from-amber-950/40 dark:via-amber-950/20 dark:to-card border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Roles</span>
          </div>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">{new Set(users.map((u) => u.role)).size}</p>
        </Card>
      </div>

      {/* Toggle between Users List and Permissions */}
      <div className="flex items-center gap-2">
        <Button
          variant={!showPermissions ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setShowPermissions(false)}
        >
          <Users className="h-3.5 w-3.5" />
          User List
        </Button>
        <Button
          variant={showPermissions ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setShowPermissions(true)}
        >
          <Shield className="h-3.5 w-3.5" />
          Role Permissions
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {showPermissions ? (
          <motion.div
            key="permissions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                    <Shield className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Role Permissions Matrix</CardTitle>
                    <CardDescription className="text-xs">Configure granular access control for each role</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <RolePermissionsMatrix />
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="user-list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* User Table */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <Users className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">Team Members</CardTitle>
                      <CardDescription className="text-xs">Manage user access and role-based permissions</CardDescription>
                    </div>
                  </div>
                  <Button size="sm" className="gap-1.5" onClick={() => setShowAddForm(!showAddForm)}>
                    <UserPlus className="h-3.5 w-3.5" />
                    Add User
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search & Filter */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 text-xs"
                    />
                  </div>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[160px] h-9 text-xs">
                      <SelectValue placeholder="Filter by role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="MLRO">MLRO</SelectItem>
                      <SelectItem value="Compliance Officer">Compliance Officer</SelectItem>
                      <SelectItem value="Analyst">Analyst</SelectItem>
                      <SelectItem value="Auditor">Auditor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Add User Form */}
                <AnimatePresence>
                  {showAddForm && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 space-y-3">
                        <h4 className="text-xs font-semibold">Add New User</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-medium">Full Name</Label>
                            <Input placeholder="e.g. John Smith" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-medium">Email</Label>
                            <Input type="email" placeholder="e.g. john@example.com.au" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-medium">Role</Label>
                            <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as UserRecord['role'] })}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Analyst">Analyst</SelectItem>
                                <SelectItem value="Compliance Officer">Compliance Officer</SelectItem>
                                <SelectItem value="MLRO">MLRO</SelectItem>
                                <SelectItem value="Auditor">Auditor</SelectItem>
                                <SelectItem value="Admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-medium">Department</Label>
                            <Select value={newUser.department} onValueChange={(v) => setNewUser({ ...newUser, department: v })}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Compliance">Compliance</SelectItem>
                                <SelectItem value="Risk">Risk</SelectItem>
                                <SelectItem value="Audit">Audit</SelectItem>
                                <SelectItem value="IT">IT</SelectItem>
                                <SelectItem value="Operations">Operations</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowAddForm(false)}>Cancel</Button>
                          <Button size="sm" className="text-xs h-7 gap-1" onClick={handleAddUser} disabled={!newUser.name || !newUser.email}>
                            <UserPlus className="h-3 w-3" /> Add User
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* User List */}
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {filteredUsers.map((user, idx) => (
                      <motion.div
                        key={user.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ delay: idx * 0.03, duration: 0.2 }}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 hover:shadow-sm ${
                          user.status === 'suspended'
                            ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10'
                            : user.status === 'inactive'
                              ? 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20 opacity-70'
                              : 'border-border hover:border-primary/20'
                        }`}
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800">
                            {user.name.split(' ').map((n) => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{user.name}</span>
                            <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${ROLE_COLORS[user.role] ?? ''}`}>
                              {user.role}
                            </Badge>
                            <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${STATUS_STYLES[user.status]}`}>
                              {user.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {user.email}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* MFA indicator */}
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${
                            user.mfaEnabled
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                          }`}>
                            <Shield className="h-3 w-3" />
                            {user.mfaEnabled ? 'MFA' : 'No MFA'}
                          </div>

                          {/* Last login */}
                          <span className="text-[10px] text-muted-foreground hidden lg:block min-w-[60px] text-right">
                            {formatTimeAgo(user.lastLogin)}
                          </span>

                          {/* Actions */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => handleToggleMFA(user.id)}>
                                <Shield className="h-3.5 w-3.5 mr-2" />
                                {user.mfaEnabled ? 'Disable MFA' : 'Enable MFA'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleStatus(user.id)}>
                                {user.status === 'active' ? (
                                  <><XCircle className="h-3.5 w-3.5 mr-2" /> Suspend User</>
                                ) : (
                                  <><CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Reactivate User</>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {filteredUsers.length === 0 && (
                    <div className="py-8 text-center">
                      <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No users found matching your criteria</p>
                    </div>
                  )}
                </div>

                {/* Footer Info */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border">
                  <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="text-[10px] text-muted-foreground">
                    Role-based access control (RBAC) is enforced across all platform features. MLRO = Money Laundering Reporting Officer. All access changes are logged in the audit trail.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── System Health Monitor Tab ──────────────────────────────────────────────────

interface ServiceStatus {
  name: string;
  icon: React.ElementType;
  status: 'operational' | 'degraded' | 'down';
  uptime: number;
  responseTime: number;
  lastIncident: string;
  responseHistory: number[];
}

const SERVICE_ICONS: Record<string, React.ElementType> = {
  'API Server': Server,
  'Database': HardDrive,
  'Document Engine': FileSearch,
  'Sanctions API': ShieldAlert,
  'Notification Service': BellRing,
  'AI Service': Brain,
};

const DEFAULT_SERVICES: ServiceStatus[] = [
  { name: 'API Server', icon: Server, status: 'operational', uptime: 99.98, responseTime: 45, lastIncident: '15 days ago', responseHistory: [42, 48, 44, 46, 43, 45, 47, 44] },
  { name: 'Database', icon: HardDrive, status: 'operational', uptime: 99.95, responseTime: 12, lastIncident: '22 days ago', responseHistory: [10, 14, 11, 13, 12, 15, 11, 12] },
  { name: 'Document Engine', icon: FileSearch, status: 'degraded', uptime: 98.7, responseTime: 890, lastIncident: '2 hours ago', responseHistory: [120, 150, 200, 350, 500, 650, 780, 890] },
  { name: 'Sanctions API', icon: ShieldAlert, status: 'operational', uptime: 99.9, responseTime: 180, lastIncident: '8 days ago', responseHistory: [175, 182, 178, 185, 179, 183, 181, 180] },
  { name: 'Notification Service', icon: BellRing, status: 'operational', uptime: 99.85, responseTime: 35, lastIncident: '5 days ago', responseHistory: [30, 38, 32, 36, 34, 33, 37, 35] },
  { name: 'AI Service', icon: Brain, status: 'operational', uptime: 99.2, responseTime: 420, lastIncident: '3 days ago', responseHistory: [380, 410, 395, 430, 415, 425, 400, 420] },
];

const STATUS_CONFIG: Record<string, { color: string; bg: string; dot: string; label: string; pulse: string }> = {
  operational: {
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
    label: 'Operational',
    pulse: 'badge-pulse',
  },
  degraded: {
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
    label: 'Degraded',
    pulse: 'badge-pulse',
  },
  down: {
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
    dot: 'bg-red-500',
    label: 'Down',
    pulse: 'badge-pulse',
  },
};

function ResponseTimeChart({ data, color }: { data: number[]; color: string }) {
  const maxVal = Math.max(...data, 1);
  const barWidth = 100 / data.length;

  return (
    <div className="flex items-end gap-0.5 h-8 w-full">
      {data.map((val, i) => {
        const height = Math.max((val / maxVal) * 100, 4);
        return (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${height}%` }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className={`rounded-t-sm ${color} min-w-0`}
            style={{ width: `${barWidth}%` }}
          />
        );
      })}
    </div>
  );
}

function SystemHealthMonitorTab() {
  const [services, setServices] = useState<ServiceStatus[]>(DEFAULT_SERVICES);
  const [lastChecked, setLastChecked] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const overallHealth = useMemo(() => {
    const operational = services.filter((s) => s.status === 'operational').length;
    const degraded = services.filter((s) => s.status === 'degraded').length;
    const down = services.filter((s) => s.status === 'down').length;
    if (down > 0) return { score: Math.round((operational / services.length) * 100), label: 'Critical', color: 'text-red-600 dark:text-red-400', bg: 'from-red-50 to-red-100/50 dark:from-red-950/40 dark:to-red-950/20' };
    if (degraded > 0) return { score: Math.round(((operational + degraded * 0.5) / services.length) * 100), label: 'Partial', color: 'text-amber-600 dark:text-amber-400', bg: 'from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-950/20' };
    return { score: 100, label: 'Healthy', color: 'text-emerald-600 dark:text-emerald-400', bg: 'from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-950/20' };
  }, [services]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setServices((prev) =>
      prev.map((s) => ({
        ...s,
        responseTime: Math.max(5, s.responseTime + Math.round((Math.random() - 0.5) * 20)),
        responseHistory: [...s.responseHistory.slice(1), Math.max(5, s.responseTime + Math.round((Math.random() - 0.5) * 20))],
      }))
    );
    setLastChecked(0);
    setIsRefreshing(false);
    toast.success('System health refreshed');
  }, []);

  // Auto-increment "last checked" counter
  useEffect(() => {
    const interval = setInterval(() => {
      setLastChecked((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatLastChecked = (seconds: number) => {
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    return `${mins}m ago`;
  };

  const healthScoreColor = overallHealth.score >= 90 ? 'text-emerald-600 dark:text-emerald-400' : overallHealth.score >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="space-y-6">
      {/* Overall Health Score */}
      <Card className={`bg-gradient-to-r ${overallHealth.bg}`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    className="text-muted/20"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    className={healthScoreColor}
                    strokeWidth="3"
                    strokeDasharray={`${overallHealth.score}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-lg font-bold ${healthScoreColor}`}>{overallHealth.score}%</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Activity className={`h-5 w-5 ${overallHealth.color}`} />
                  <h3 className="text-sm font-semibold">System Health</h3>
                  <Badge variant="outline" className={`text-[10px] ${overallHealth.color} border-current/20`}>
                    {overallHealth.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {services.filter((s) => s.status === 'operational').length} operational, {' '}
                  {services.filter((s) => s.status === 'degraded').length} degraded, {' '}
                  {services.filter((s) => s.status === 'down').length} down
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    Last checked: {formatLastChecked(lastChecked)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Service Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service, idx) => {
          const config = STATUS_CONFIG[service.status];
          const IconComp = SERVICE_ICONS[service.name] ?? Activity;
          const barColor = service.status === 'operational'
            ? 'bg-emerald-400 dark:bg-emerald-500'
            : service.status === 'degraded'
              ? 'bg-amber-400 dark:bg-amber-500'
              : 'bg-red-400 dark:bg-red-500';

          return (
            <motion.div
              key={service.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08, duration: 0.3 }}
            >
              <Card className={`h-full transition-all duration-300 hover:shadow-md border ${config.bg} gradient-border-card`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${service.status === 'operational' ? 'bg-emerald-100 dark:bg-emerald-900/30' : service.status === 'degraded' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                        <IconComp className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold">{service.name}</h4>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full ${config.dot} ${config.pulse}`} />
                      <Badge variant="outline" className={`text-[9px] h-5 px-1.5 ${config.color} border-current/20`}>
                        {config.label}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Uptime</p>
                      <p className={`text-sm font-bold ${service.uptime >= 99.9 ? 'text-emerald-600 dark:text-emerald-400' : service.uptime >= 99 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                        {service.uptime}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Response</p>
                      <p className={`text-sm font-bold ${service.responseTime < 200 ? 'text-emerald-600 dark:text-emerald-400' : service.responseTime < 500 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                        {service.responseTime}ms
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Incident</p>
                      <p className="text-xs font-medium text-muted-foreground mt-0.5">
                        {service.lastIncident}
                      </p>
                    </div>
                  </div>

                  {/* Response Time Mini Chart */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Response Time (last 8 checks)</p>
                    <ResponseTimeChart data={service.responseHistory} color={barColor} />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Status Legend */}
      <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-emerald-500 badge-pulse" />
          <span className="text-[10px] text-muted-foreground">Operational</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-amber-500 badge-pulse" />
          <span className="text-[10px] text-muted-foreground">Degraded</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-red-500 badge-pulse" />
          <span className="text-[10px] text-muted-foreground">Down</span>
        </div>
        <div className="ml-auto">
          <span className="text-[10px] text-muted-foreground">Auto-refreshes every 30s</span>
        </div>
      </div>
    </div>
  );
}

// ─── Compliance Policy Config Tab ───────────────────────────────────────────────

function CompliancePolicyConfigTab() {
  const [cddLevel, setCddLevel] = useState<'Simplified' | 'Standard' | 'Enhanced'>(() => getSetting('cddLevel', 'Standard'));
  const [eddTriggers, setEddTriggers] = useState<{ pep: boolean; highRiskJurisdiction: boolean; adverseMedia: boolean }>(() =>
    getSetting('eddTriggers', { pep: true, highRiskJurisdiction: true, adverseMedia: false })
  );
  const [monitoringFreq, setMonitoringFreq] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Quarterly'>(() => getSetting('monitoringFreq', 'Weekly'));
  const [riskMethodology, setRiskMethodology] = useState<'Simple scoring' | 'Matrix-based' | 'ML-assisted'>(() => getSetting('riskMethodology', 'Matrix-based'));
  const [smrDeadline, setSmrDeadline] = useState<'1' | '3' | '24' | '72'>(() => getSetting('smrDeadline', '24'));
  const [ttrWindow, setTtrWindow] = useState<'1' | '3' | '5' | '10'>(() => getSetting('ttrWindow', '3'));
  const [iftiDeadline, setIftiDeadline] = useState<'1' | '3' | '5' | '10'>(() => getSetting('iftiDeadline', '3'));

  const handleSave = () => {
    setSetting('cddLevel', cddLevel);
    setSetting('eddTriggers', eddTriggers);
    setSetting('monitoringFreq', monitoringFreq);
    setSetting('riskMethodology', riskMethodology);
    setSetting('smrDeadline', smrDeadline);
    setSetting('ttrWindow', ttrWindow);
    setSetting('iftiDeadline', iftiDeadline);
    toast.success('Compliance policy configuration saved');
  };

  const handleReset = () => {
    setCddLevel('Standard');
    setEddTriggers({ pep: true, highRiskJurisdiction: true, adverseMedia: false });
    setMonitoringFreq('Weekly');
    setRiskMethodology('Matrix-based');
    setSmrDeadline('24');
    setTtrWindow('3');
    setIftiDeadline('3');
    toast.info('Reset to defaults — click Save to apply');
  };

  return (
    <div className="space-y-6">
      {/* AML/CTF Program Settings */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/30">
              <Scroll className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">AML/CTF Program Settings</CardTitle>
              <CardDescription className="text-xs">Configure your Anti-Money Laundering and Counter-Terrorism Financing program parameters</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Customer Due Diligence Level */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Customer Due Diligence Level</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['Simplified', 'Standard', 'Enhanced'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setCddLevel(level)}
                  className={`p-3 rounded-lg border text-center transition-all duration-200 ${
                    cddLevel === level
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/30 hover:bg-muted/30'
                  }`}
                >
                  <p className="text-xs font-semibold">{level}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {level === 'Simplified' && 'Low-risk clients only'}
                    {level === 'Standard' && 'Default verification'}
                    {level === 'Enhanced' && 'High-risk thorough review'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Enhanced Due Diligence Triggers */}
          <div className="space-y-3">
            <Label className="text-xs font-medium">Enhanced Due Diligence Triggers</Label>
            <p className="text-[10px] text-muted-foreground">Select conditions that automatically trigger enhanced due diligence procedures</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">PEP (Politically Exposed Person)</Label>
                  <p className="text-[10px] text-muted-foreground">Trigger EDD when client is identified as a PEP or PEP associate</p>
                </div>
                <Checkbox
                  checked={eddTriggers.pep}
                  onCheckedChange={(v) => setEddTriggers((prev) => ({ ...prev, pep: v === true }))}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">High-Risk Jurisdiction</Label>
                  <p className="text-[10px] text-muted-foreground">Trigger EDD for clients domiciled in FATF grey/black list countries</p>
                </div>
                <Checkbox
                  checked={eddTriggers.highRiskJurisdiction}
                  onCheckedChange={(v) => setEddTriggers((prev) => ({ ...prev, highRiskJurisdiction: v === true }))}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Adverse Media</Label>
                  <p className="text-[10px] text-muted-foreground">Trigger EDD when adverse media screening returns positive hits</p>
                </div>
                <Checkbox
                  checked={eddTriggers.adverseMedia}
                  onCheckedChange={(v) => setEddTriggers((prev) => ({ ...prev, adverseMedia: v === true }))}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Ongoing Monitoring Frequency */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Ongoing Monitoring Frequency</Label>
            <Select value={monitoringFreq} onValueChange={(v) => setMonitoringFreq(v as typeof monitoringFreq)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Daily">Daily</SelectItem>
                <SelectItem value="Weekly">Weekly</SelectItem>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="Quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              How frequently ongoing client monitoring reviews are performed. AUSTRAC recommends at minimum quarterly reviews.
            </p>
          </div>

          <Separator />

          {/* Risk Assessment Methodology */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Risk Assessment Methodology</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['Simple scoring', 'Matrix-based', 'ML-assisted'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setRiskMethodology(method)}
                  className={`p-3 rounded-lg border text-center transition-all duration-200 ${
                    riskMethodology === method
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/30 hover:bg-muted/30'
                  }`}
                >
                  <p className="text-xs font-semibold">{method}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {method === 'Simple scoring' && 'Weighted point system'}
                    {method === 'Matrix-based' && 'Likelihood × Impact grid'}
                    {method === 'ML-assisted' && 'AI-powered risk prediction'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reporting Obligations */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Reporting Obligations</CardTitle>
              <CardDescription className="text-xs">Configure AUSTRAC reporting deadlines and windows per regulatory requirements</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* SMR Filing Deadline */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">SMR Filing Deadline</Label>
            <p className="text-[10px] text-muted-foreground">Hours from detection to file a Suspicious Matter Report</p>
            <Select value={smrDeadline} onValueChange={setSmrDeadline}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 hour (Critical)</SelectItem>
                <SelectItem value="3">3 hours (Urgent)</SelectItem>
                <SelectItem value="24">24 hours (Standard)</SelectItem>
                <SelectItem value="72">72 hours (Extended)</SelectItem>
              </SelectContent>
            </Select>
            <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                AUSTRAC requires SMR filing within 24 hours of forming a suspicion under s41 AML/CTF Act
              </p>
            </div>
          </div>

          <Separator />

          {/* TTR Reporting Window */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">TTR Reporting Window</Label>
            <p className="text-[10px] text-muted-foreground">Business days from threshold transaction to report</p>
            <Select value={ttrWindow} onValueChange={setTtrWindow}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 business day</SelectItem>
                <SelectItem value="3">3 business days</SelectItem>
                <SelectItem value="5">5 business days</SelectItem>
                <SelectItem value="10">10 business days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* IFTI-E Reporting Deadline */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">IFTI-E Reporting Deadline</Label>
            <p className="text-[10px] text-muted-foreground">Business days from international funds transfer instruction to report</p>
            <Select value={iftiDeadline} onValueChange={setIftiDeadline}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 business day</SelectItem>
                <SelectItem value="3">3 business days</SelectItem>
                <SelectItem value="5">5 business days</SelectItem>
                <SelectItem value="10">10 business days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Save / Reset */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to Defaults
        </Button>
        <Button size="sm" onClick={handleSave} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          Save Policy Configuration
        </Button>
      </div>
    </div>
  );
}

// ─── Audit Change Log Tab ───────────────────────────────────────────────────────

interface AuditChangeEntry {
  id: string;
  timestamp: string;
  user: string;
  userRole: string;
  settingChanged: string;
  previousValue: string;
  newValue: string;
  ipAddress: string;
}

const MOCK_AUDIT_ENTRIES: AuditChangeEntry[] = [];

function AuditChangeLogTab() {
  const [userFilter, setUserFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('7d');

  const uniqueUsers = useMemo(() => {
    const users = new Set(MOCK_AUDIT_ENTRIES.map((e) => e.user));
    return Array.from(users);
  }, []);

  const filteredEntries = useMemo(() => {
    let entries = MOCK_AUDIT_ENTRIES;

    if (userFilter !== 'all') {
      entries = entries.filter((e) => e.user === userFilter);
    }

    if (dateFilter !== 'all') {
      const daysMap: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30 };
      const days = daysMap[dateFilter] ?? 7;
      const cutoff = Date.now() - days * 86400000;
      entries = entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
    }

    return entries;
  }, [userFilter, dateFilter]);

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
      date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-gradient-to-br from-slate-50 via-slate-50/80 to-white dark:from-slate-950/40 dark:via-slate-950/20 dark:to-card border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Changes</span>
          </div>
          <p className="text-2xl font-bold text-slate-700 dark:text-slate-400 mt-1">{MOCK_AUDIT_ENTRIES.length}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-sky-50 via-sky-50/80 to-white dark:from-sky-950/40 dark:via-sky-950/20 dark:to-card border-sky-200 dark:border-sky-800">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Users</span>
          </div>
          <p className="text-2xl font-bold text-sky-700 dark:text-sky-400 mt-1">{uniqueUsers.length}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-amber-50 via-amber-50/80 to-white dark:from-amber-950/40 dark:via-amber-950/20 dark:to-card border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Last 24h</span>
          </div>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
            {MOCK_AUDIT_ENTRIES.filter((e) => Date.now() - new Date(e.timestamp).getTime() < 86400000).length}
          </p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-emerald-50 via-emerald-50/80 to-white dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-card border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Compliance</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">Tracked</p>
        </Card>
      </div>

      {/* Filter Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                <Filter className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Configuration Change Log</CardTitle>
                <CardDescription className="text-xs">Complete audit trail of all configuration modifications</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              {filteredEntries.length} entries
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-[180px] h-9 text-xs">
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {uniqueUsers.map((user) => (
                  <SelectItem key={user} value={user}>{user}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Audit Table */}
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">Timestamp</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">User</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">Setting Changed</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">Previous Value</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">New Value</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry, idx) => (
                  <TableRow key={entry.id} className="transition-colors">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(entry.timestamp)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[8px] font-semibold bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800">
                            {entry.user.split(' ').map((n) => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-medium">{entry.user}</p>
                          <Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${ROLE_COLORS[entry.userRole] ?? ''}`}>
                            {entry.userRole}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {entry.settingChanged}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">
                        {entry.previousValue}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                        {entry.newValue}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                      {entry.ipAddress}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredEntries.length === 0 && (
            <div className="py-8 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No audit entries found matching your filters</p>
            </div>
          )}

          {/* Footer Info */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-[10px] text-muted-foreground">
              All configuration changes are immutably recorded per AUSTRAC regulatory requirements. Audit logs are retained for the duration of your data retention period and cannot be modified or deleted.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
