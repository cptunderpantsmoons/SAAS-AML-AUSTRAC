'use client';

import React, { useState, useMemo } from 'react';
import { useClients, useCreateClient, useInitiateOnboarding, useOnboardingStatus, useAdvanceOnboarding, useTransactions, useAlerts } from '@/hooks/useApi';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { KPICard } from '@/components/shared/KPICard';
import { UserPlus, Search, Plus, CheckCircle2, Circle, ArrowRight, Loader2, Mail, Phone, Building, Globe, ShieldCheck, AlertTriangle, FileText, Activity, Users, Clock, Download, Filter, XCircle, HourglassIcon, ShieldCheckIcon, ListFilter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const WORKFLOW_STEPS = [
  { key: 'initiated', label: 'Initiated', description: 'Client onboarding request submitted', estimatedTime: '~1 min' },
  { key: 'document_review', label: 'Document Review', description: 'Review and verify submitted identity documents', estimatedTime: '~15 min' },
  { key: 'kyc_verification', label: 'KYC Verification', description: 'Identity verification against government databases', estimatedTime: '~5 min' },
  { key: 'sanctions_check', label: 'Sanctions Check', description: 'Screen against sanctions and PEP lists', estimatedTime: '~2 min' },
  { key: 'ubo_analysis', label: 'UBO Analysis', description: 'Identify ultimate beneficial owners (entities only)', estimatedTime: '~10 min' },
  { key: 'risk_assessment', label: 'Risk Assessment', description: 'Calculate and assign risk rating', estimatedTime: '~3 min' },
  { key: 'completed', label: 'Completed', description: 'Onboarding process finalized', estimatedTime: '—' },
];

const ONBOARDING_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'initiated', label: 'Initiated' },
  { value: 'document_review', label: 'Document Review' },
  { value: 'kyc_verification', label: 'KYC Verification' },
  { value: 'sanctions_check', label: 'Sanctions Check' },
  { value: 'ubo_analysis', label: 'UBO Analysis' },
  { value: 'risk_assessment', label: 'Risk Assessment' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
];

/** CSV helpers */
function escapeCSV(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Get entity type icon */
function EntityTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'individual':
      return <UserPlus className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />;
    case 'company':
      return <Building className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />;
    case 'trust':
    case 'partnership':
      return <Globe className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />;
    default:
      return <UserPlus className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />;
  }
}

interface OnboardingSectionProps {
  onClientSelect?: (clientId: string) => void;
}

export function OnboardingSection({ onClientSelect }: OnboardingSectionProps) {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [quickFilter, setQuickFilter] = useState<string>('all');
  const [showNewClient, setShowNewClient] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const { data: clientsData, isLoading } = useClients({
    search: search || undefined,
    risk: riskFilter && riskFilter !== 'all' ? riskFilter : undefined,
    status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
    limit: 50,
  });
  const createClientMutation = useCreateClient();
  const initiateOnboarding = useInitiateOnboarding();
  const advanceOnboarding = useAdvanceOnboarding();

  const allClients = (clientsData?.clients ?? []) as Array<Record<string, unknown>>;

  // Apply quick filter on top of API-returned clients
  const clients = useMemo(() => {
    if (quickFilter === 'all') return allClients;
    return allClients.filter((c: Record<string, unknown>) => {
      const status = c.onboardingStatus as string;
      switch (quickFilter) {
        case 'pending': return ['initiated', 'pending', 'document_review'].includes(status);
        case 'in_progress': return ['kyc_verification', 'sanctions_check', 'ubo_analysis', 'risk_assessment'].includes(status);
        case 'verified': return status === 'completed';
        case 'rejected': return status === 'rejected';
        default: return true;
      }
    });
  }, [allClients, quickFilter]);

  // New client form state
  const [newClient, setNewClient] = useState({
    fullName: '', entityType: 'individual', email: '', phone: '', country: 'AU',
  });

  // Computed stats for the statistics cards (based on all clients, not filtered)
  const stats = useMemo(() => {
    const total = allClients.length;
    const initiated = allClients.filter((c: Record<string, unknown>) => ['initiated', 'pending'].includes(c.onboardingStatus as string)).length;
    const inProgress = allClients.filter((c: Record<string, unknown>) =>
      !['completed', 'rejected', 'initiated', 'pending'].includes(c.onboardingStatus as string)
    ).length;
    const verified = allClients.filter((c: Record<string, unknown>) => c.onboardingStatus === 'completed').length;
    const rejected = allClients.filter((c: Record<string, unknown>) => c.onboardingStatus === 'rejected').length;
    const escalated = allClients.filter((c: Record<string, unknown>) =>
      ['pending'].includes(c.kycStatus as string) || ['pending'].includes(c.sanctionsStatus as string)
    ).length;
    const completedPct = total > 0 ? Math.round((verified / total) * 100) : 0;
    return { total, initiated, inProgress, verified, rejected, escalated, completedPct };
  }, [allClients]);

  // Pipeline stats (based on all clients)
  const pipelineStats = useMemo(() => {
    const total = allClients.length || 1;
    const completed = allClients.filter((c: Record<string, unknown>) => c.onboardingStatus === 'completed').length;
    const inProgress = allClients.filter((c: Record<string, unknown>) => !['completed', 'rejected'].includes(c.onboardingStatus as string)).length;
    const pending = allClients.filter((c: Record<string, unknown>) => c.onboardingStatus === 'pending' || c.onboardingStatus === 'initiated').length;
    const rejected = allClients.filter((c: Record<string, unknown>) => c.onboardingStatus === 'rejected').length;
    return {
      completed,
      inProgress,
      pending,
      rejected,
      total: allClients.length,
      completedPct: Math.round((completed / total) * 100),
      inProgressPct: Math.round((inProgress / total) * 100),
      pendingPct: Math.round((pending / total) * 100),
      rejectedPct: Math.round((rejected / total) * 100),
    };
  }, [allClients]);

  // CSV export handler
  const handleExportCSV = () => {
    if (clients.length === 0) {
      toast.error('No clients to export');
      return;
    }
    const headers = [
      'Client ID', 'Full Name', 'Entity Type', 'Risk Rating',
      'Onboarding Status', 'KYC Status', 'Sanctions Status', 'PEP Status',
      'Email', 'Phone', 'Country',
    ];
    const rows = clients.map((c: Record<string, unknown>) => [
      String(c.clientId ?? ''),
      String(c.fullName ?? ''),
      String((c.entityType as string ?? '').replace(/_/g, ' ')),
      String(c.riskRating ?? ''),
      String((c.onboardingStatus as string ?? '').replace(/_/g, ' ')),
      String((c.kycStatus as string ?? '').replace(/_/g, ' ')),
      String((c.sanctionsStatus as string ?? '').replace(/_/g, ' ')),
      String((c.pepStatus as string ?? '').replace(/_/g, ' ')),
      String(c.email ?? ''),
      String(c.phone ?? ''),
      String(c.country ?? ''),
    ]);
    downloadCSV(
      `clients-export-${new Date().toISOString().split('T')[0]}.csv`,
      headers,
      rows,
    );
    toast.success(`Exported ${clients.length} clients to CSV`);
  };

  const handleCreateClient = async () => {
    if (!newClient.fullName) { toast.error('Full name is required'); return; }
    try {
      const result = await createClientMutation.mutateAsync(newClient);
      toast.success('Client created successfully');
      setShowNewClient(false);
      // Auto-initiate onboarding
      const clientId = (result as Record<string, unknown>).id as string;
      await initiateOnboarding.mutateAsync({ clientId });
      toast.success('Onboarding initiated');
    } catch {
      toast.error('Failed to create client');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Client Onboarding"
        description="KYC/KYB workflow management"
        icon={UserPlus}
        accentColor="#0ea5e9"
        breadcrumb={["Platform", "Onboarding"]}
        actions={
          <Button onClick={() => setShowNewClient(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Client
          </Button>
        }
      />

      {/* Onboarding Progress Summary Card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Card className="border-border/80 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-sky-500 via-emerald-500 to-amber-500" />
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ListFilter className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Onboarding Progress Summary</span>
              </div>
              <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-[10px]">{stats.total} Total Cases</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <div className="p-1.5 rounded-md bg-slate-200 dark:bg-slate-700">
                  <HourglassIcon className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                </div>
                <div>
                  <div className="text-lg font-bold metric-value animate-count-up">{stats.initiated}</div>
                  <div className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Initiated</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-sky-50 dark:bg-sky-950/20">
                <div className="p-1.5 rounded-md bg-sky-200 dark:bg-sky-900/50">
                  <Clock className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <div className="text-lg font-bold metric-value animate-count-up">{stats.inProgress}</div>
                  <div className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">In Progress</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                <div className="p-1.5 rounded-md bg-emerald-200 dark:bg-emerald-900/50">
                  <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-lg font-bold metric-value animate-count-up">{stats.verified}</div>
                  <div className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Verified</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20">
                <div className="p-1.5 rounded-md bg-red-200 dark:bg-red-900/50">
                  <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <div className="text-lg font-bold metric-value animate-count-up">{stats.rejected}</div>
                  <div className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Rejected</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <div className="p-1.5 rounded-md bg-amber-200 dark:bg-amber-900/50">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-bold metric-value animate-count-up">{stats.escalated}</div>
                  <div className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Escalated</div>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium">Completion Rate</span>
                <span className="text-xs font-bold gradient-text-value">{stats.completedPct}%</span>
              </div>
              <Progress value={stats.completedPct} className="h-2.5" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all', label: 'All', icon: Users, count: allClients.length, color: 'slate' },
          { key: 'pending', label: 'Pending', icon: HourglassIcon, count: allClients.filter((c: Record<string, unknown>) => ['initiated', 'pending', 'document_review'].includes(c.onboardingStatus as string)).length, color: 'slate' },
          { key: 'in_progress', label: 'In Progress', icon: Clock, count: allClients.filter((c: Record<string, unknown>) => ['kyc_verification', 'sanctions_check', 'ubo_analysis', 'risk_assessment'].includes(c.onboardingStatus as string)).length, color: 'sky' },
          { key: 'verified', label: 'Verified', icon: CheckCircle2, count: allClients.filter((c: Record<string, unknown>) => c.onboardingStatus === 'completed').length, color: 'emerald' },
          { key: 'rejected', label: 'Rejected', icon: XCircle, count: allClients.filter((c: Record<string, unknown>) => c.onboardingStatus === 'rejected').length, color: 'red' },
        ].map((filter) => {
          const isActive = quickFilter === filter.key;
          const colorClasses: Record<string, string> = {
            slate: isActive ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300' : 'bg-background border-border text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-900',
            sky: isActive ? 'bg-sky-100 dark:bg-sky-900/30 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300' : 'bg-background border-border text-muted-foreground hover:bg-sky-50 dark:hover:bg-sky-950/20',
            emerald: isActive ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300' : 'bg-background border-border text-muted-foreground hover:bg-emerald-50 dark:hover:bg-emerald-950/20',
            red: isActive ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300' : 'bg-background border-border text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950/20',
          };
          return (
            <Button
              key={filter.key}
              variant="outline"
              size="sm"
              className={`h-8 text-xs gap-1.5 border transition-all duration-200 ${colorClasses[filter.color]}`}
              onClick={() => setQuickFilter(filter.key)}
            >
              <filter.icon className="h-3.5 w-3.5" />
              {filter.label}
              <Badge variant="secondary" className={`h-4 px-1 text-[9px] ${isActive ? 'bg-white/50 dark:bg-white/10' : ''}`}>{filter.count}</Badge>
            </Button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Onboarding Status" />
          </SelectTrigger>
          <SelectContent>
            {ONBOARDING_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Risk Rating" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risks</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          disabled={clients.length === 0}
          className="h-9"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Onboarding Pipeline Progress */}
      {clients.length > 0 && (
        <Card className="border-border/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Onboarding Pipeline Health</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{pipelineStats.completedPct}% Complete</span>
            </div>
            <div className="space-y-2">
              <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                <div
                  className="bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500 relative"
                  style={{ width: `${pipelineStats.completedPct}%` }}
                >
                  {pipelineStats.completedPct >= 10 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90">{pipelineStats.completedPct}%</span>
                  )}
                </div>
                <div
                  className="bg-gradient-to-r from-sky-400 to-sky-500 transition-all duration-500 relative"
                  style={{ width: `${pipelineStats.inProgressPct}%` }}
                >
                  {pipelineStats.inProgressPct >= 10 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90">{pipelineStats.inProgressPct}%</span>
                  )}
                </div>
                <div
                  className="bg-gradient-to-r from-amber-300 to-amber-400 transition-all duration-500 relative"
                  style={{ width: `${pipelineStats.pendingPct}%` }}
                >
                  {pipelineStats.pendingPct >= 10 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-amber-900/80">{pipelineStats.pendingPct}%</span>
                  )}
                </div>
                {pipelineStats.rejectedPct > 0 && (
                  <div
                    className="bg-gradient-to-r from-red-300 to-red-400 transition-all duration-500 relative"
                    style={{ width: `${pipelineStats.rejectedPct}%` }}
                  >
                    {pipelineStats.rejectedPct >= 10 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90">{pipelineStats.rejectedPct}%</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" /> Completed: {pipelineStats.completed}</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gradient-to-r from-sky-400 to-sky-500" /> In Progress: {pipelineStats.inProgress}</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gradient-to-r from-amber-300 to-amber-400" /> Pending: {pipelineStats.pending}</span>
                {pipelineStats.rejected > 0 && (
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gradient-to-r from-red-300 to-red-400" /> Rejected: {pipelineStats.rejected}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Client List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading clients...</p>
            </div>
          ) : clients.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="p-12 text-center"
            >
              <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-sm font-semibold text-foreground/80 mb-1">No onboarding cases found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {quickFilter !== 'all'
                  ? `No cases match the "${quickFilter.replace(/_/g, ' ')}" filter. Try selecting a different filter or create a new client.`
                  : search || statusFilter || riskFilter
                  ? 'No clients match your current search or filter criteria. Try adjusting your filters.'
                  : 'Get started by creating a new client to begin the onboarding process.'
                }
              </p>
              {(quickFilter !== 'all' || search || statusFilter || riskFilter) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => { setQuickFilter('all'); setSearch(''); setStatusFilter(''); setRiskFilter(''); }}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Clear All Filters
                </Button>
              )}
              {!search && !statusFilter && !riskFilter && quickFilter === 'all' && (
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowNewClient(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create New Client
                </Button>
              )}
            </motion.div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="data-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Onboarding</TableHead>
                    <TableHead>KYC</TableHead>
                    <TableHead>Sanctions</TableHead>
                    <TableHead>PEP</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {clients.map((client: Record<string, unknown>, idx: number) => (
                      <motion.tr
                        key={client.id as string}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03, duration: 0.25, ease: 'easeOut' }}
                        className={`cursor-pointer hover:bg-muted/50 border-b border-border/50 transition-colors duration-150 hover:border-l-2 hover:border-l-sky-400 ${idx % 2 === 1 ? 'bg-muted/5' : ''}`}
                        onClick={() => setSelectedClientId(client.id as string)}
                      >
                        <TableCell className="font-medium text-sm py-3">
                          <div
                            className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              onClientSelect?.(client.id as string);
                            }}
                          >
                            <div className="font-medium">{client.fullName as string}</div>
                            <div className="text-[10px] text-muted-foreground">{client.clientId as string}</div>
                            {(client.email as string) && (
                              <div className="text-[10px] text-muted-foreground/70 flex items-center gap-0.5 mt-0.5">
                                <Mail className="h-2.5 w-2.5" />
                                {client.email as string}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs py-3">
                          <div className="flex items-center gap-1.5">
                            <EntityTypeIcon type={(client.entityType as string) ?? 'individual'} />
                            <span className="capitalize">{(client.entityType as string)?.replace(/_/g, ' ')}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3"><RiskBadge level={(client.riskRating as string) ?? 'low'} /></TableCell>
                        <TableCell className="py-3"><StatusBadge status={(client.onboardingStatus as string) ?? 'pending'} /></TableCell>
                        <TableCell className="py-3"><StatusBadge status={(client.kycStatus as string) ?? 'pending'} /></TableCell>
                        <TableCell className="py-3"><StatusBadge status={(client.sanctionsStatus as string) ?? 'clear'} /></TableCell>
                        <TableCell className="py-3"><StatusBadge status={(client.pepStatus as string) ?? 'clear'} /></TableCell>
                        <TableCell className="py-3">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedClientId(client.id as string); }}>
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client Detail Panel */}
      <Dialog open={!!selectedClientId} onOpenChange={() => setSelectedClientId(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Client Details</DialogTitle>
          </DialogHeader>
          {selectedClientId && <ClientDetailPanel clientId={selectedClientId} />}
        </DialogContent>
      </Dialog>

      {/* New Client Dialog */}
      <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Full Name *</label>
              <Input value={newClient.fullName} onChange={(e) => setNewClient({ ...newClient, fullName: e.target.value })} placeholder="Enter full name" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Entity Type</label>
              <Select value={newClient.entityType} onValueChange={(v) => setNewClient({ ...newClient, entityType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="trust">Trust</SelectItem>
                  <SelectItem value="partnership">Partnership</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</label>
              <Input value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} placeholder="email@example.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Phone</label>
              <Input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder="+61 4XX XXX XXX" />
            </div>
            <Button onClick={handleCreateClient} disabled={createClientMutation.isPending} className="w-full">
              {createClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create & Start Onboarding
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Client Detail Panel with Tabs */
function ClientDetailPanel({ clientId }: { clientId: string }) {
  const { data: clientsData } = useClients({ limit: 100 });
  const client = (clientsData?.clients ?? []).find((c: Record<string, unknown>) => c.id === clientId) as Record<string, unknown> | undefined;

  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="transactions">Transactions</TabsTrigger>
        <TabsTrigger value="alerts">Alerts</TabsTrigger>
        <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <ScrollArea className="max-h-[60vh]">
          {client ? <ClientProfileTab client={client} /> : <div className="p-4 text-center text-muted-foreground">Loading...</div>}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="documents">
        <ScrollArea className="max-h-[60vh]">
          <ClientDocumentsTab clientId={clientId} />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="transactions">
        <ScrollArea className="max-h-[60vh]">
          <ClientTransactionsTab clientId={clientId} />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="alerts">
        <ScrollArea className="max-h-[60vh]">
          <ClientAlertsTab clientId={clientId} />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="onboarding">
        <ScrollArea className="max-h-[60vh]">
          {client ? <OnboardingWorkflow clientId={clientId} /> : <div className="p-4 text-center text-muted-foreground">Loading...</div>}
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

/** Profile Tab */
function ClientProfileTab({ client }: { client: Record<string, unknown> }) {
  const profileFields = [
    { label: 'Full Name', value: client.fullName as string, icon: UserPlus },
    { label: 'Entity Type', value: (client.entityType as string)?.replace(/_/g, ' '), icon: Building },
    { label: 'Risk Rating', value: null, icon: AlertTriangle, badge: (client.riskRating as string) ?? 'low' },
    { label: 'ACN/ABN', value: (client.acnAbn as string) ?? '—', icon: FileText },
    { label: 'Email', value: (client.email as string) ?? '—', icon: Mail },
    { label: 'Phone', value: (client.phone as string) ?? '—', icon: Phone },
    { label: 'Country', value: (client.country as string) ?? '—', icon: Globe },
    { label: 'Onboarding Status', value: null, icon: Activity, badge: (client.onboardingStatus as string) ?? 'pending' },
    { label: 'KYC Status', value: null, icon: ShieldCheck, badge: (client.kycStatus as string) ?? 'pending' },
    { label: 'Sanctions Status', value: null, icon: ShieldCheck, badge: (client.sanctionsStatus as string) ?? 'clear' },
    { label: 'PEP Status', value: null, icon: ShieldCheck, badge: (client.pepStatus as string) ?? 'clear' },
  ];

  return (
    <div className="space-y-3 p-2">
      {profileFields.map((field) => (
        <div key={field.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
          <div className="p-2 rounded-md bg-background">
            <field.icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <span className="text-xs text-muted-foreground">{field.label}</span>
            {field.badge ? (
              <div className="mt-0.5">
                <StatusBadge status={field.badge} />
              </div>
            ) : (
              <div className="text-sm font-medium capitalize">{field.value}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Documents Tab */
function ClientDocumentsTab({ clientId }: { clientId: string }) {
  const { data: clientsData } = useClients({ limit: 100 });
  const client = (clientsData?.clients ?? []).find((c: Record<string, unknown>) => c.id === clientId) as Record<string, unknown> | undefined;
  const documents = (client?.documents as Array<Record<string, unknown>>) ?? [];

  if (documents.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No documents found for this client</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      {documents.map((doc: Record<string, unknown>) => (
        <div key={doc.id as string} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
          <div className="p-2 rounded-md bg-background">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{(doc.documentType as string)?.replace(/_/g, ' ') ?? 'Document'}</div>
            <div className="text-[10px] text-muted-foreground">
              {doc.fileName as string ?? '—'} &middot; {new Date(doc.createdAt as string).toLocaleDateString('en-AU')}
            </div>
          </div>
          <StatusBadge status={(doc.status as string) ?? 'pending'} />
        </div>
      ))}
    </div>
  );
}

/** Transactions Tab */
function ClientTransactionsTab({ clientId }: { clientId: string }) {
  const { data: txData, isLoading } = useTransactions({ clientId, limit: 20 });

  if (isLoading) {
    return <div className="p-4 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  const transactions = (txData?.transactions ?? []) as Array<Record<string, unknown>>;

  if (transactions.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No transactions found for this client</p>
      </div>
    );
  }

  const formatAUD = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);

  return (
    <div className="space-y-2 p-2">
      {transactions.map((tx: Record<string, unknown>) => (
        <div key={tx.id as string} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
          <div className="p-2 rounded-md bg-background">
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{formatAUD(tx.amount as number)}</div>
            <div className="text-[10px] text-muted-foreground">
              {(tx.transactionType as string)?.replace(/_/g, ' ')} &middot; {new Date(tx.transactionDate as string).toLocaleDateString('en-AU')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RiskBadge
              level={(tx.riskScore as number) >= 0.5 ? 'high' : (tx.riskScore as number) >= 0.3 ? 'medium' : 'low'}
              score={tx.riskScore as number}
            />
            {tx.flagged as boolean && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">Flagged</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Alerts Tab */
function ClientAlertsTab({ clientId }: { clientId: string }) {
  const { data: alertsData, isLoading } = useAlerts({ limit: 20 });

  if (isLoading) {
    return <div className="p-4 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  const allAlerts = (alertsData?.alerts ?? []) as Array<Record<string, unknown>>;
  // Filter alerts for this client
  const alerts = allAlerts.filter((a: Record<string, unknown>) => a.clientId === clientId);

  if (alerts.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No alerts found for this client</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      {alerts.map((alert: Record<string, unknown>) => (
        <div key={alert.id as string} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
          <div className="p-2 rounded-md bg-background">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{(alert.alertType as string)?.replace(/_/g, ' ') ?? 'Alert'}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {alert.description as string}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RiskBadge level={(alert.finalSeverity as string) ?? (alert.baseSeverity as string) ?? 'medium'} />
            <StatusBadge status={(alert.status as string) ?? 'open'} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Onboarding Workflow - Enhanced */
function OnboardingWorkflow({ clientId }: { clientId: string }) {
  const { data: clientsData } = useClients({ limit: 100 });
  const initiateOnboarding = useInitiateOnboarding();
  const advanceOnboarding = useAdvanceOnboarding();

  const client = (clientsData?.clients ?? []).find((c: Record<string, unknown>) => c.id === clientId) as Record<string, unknown> | undefined;

  // Find onboarding case for this client
  const onboardingCases = (client?.onboardingCases as Array<Record<string, unknown>>) ?? [];
  const activeCase = onboardingCases.find(
    (c: Record<string, unknown>) => !['completed', 'rejected'].includes(c.workflowState as string)
  );

  const caseId = (activeCase?.id as string) ?? null;
  const { data: onboardingData, isLoading: loadingOnboarding } = useOnboardingStatus(caseId);

  const workflow = onboardingData?.workflow;
  const currentState = workflow?.currentState ?? (client?.onboardingStatus as string) ?? 'pending';
  const currentStepIndex = WORKFLOW_STEPS.findIndex(s => s.key === currentState);

  const handleAdvance = async () => {
    if (!caseId) {
      // Initiate onboarding first
      try {
        await initiateOnboarding.mutateAsync({ clientId });
        toast.success('Onboarding initiated');
      } catch {
        toast.error('Failed to initiate onboarding');
      }
      return;
    }
    try {
      await advanceOnboarding.mutateAsync({ id: caseId });
      toast.success('Workflow advanced');
    } catch {
      toast.error('Failed to advance workflow');
    }
  };

  return (
    <ScrollArea className="max-h-[60vh]">
      <div className="space-y-6">
        {/* Client Info */}
        {client && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{client.fullName as string}</span></div>
            <div><span className="text-muted-foreground">Type:</span> <span className="capitalize">{(client.entityType as string)?.replace(/_/g, ' ')}</span></div>
            <div><span className="text-muted-foreground">Risk:</span> <RiskBadge level={(client.riskRating as string) ?? 'low'} /></div>
            <div><span className="text-muted-foreground">KYC:</span> <StatusBadge status={(client.kycStatus as string) ?? 'pending'} /></div>
          </div>
        )}

        {/* Workflow Steps - Enhanced */}
        <div>
          <h4 className="text-sm font-semibold mb-4">Onboarding Progress</h4>
          {loadingOnboarding ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {WORKFLOW_STEPS.map((step, index) => {
                  const isCompleted = index < currentStepIndex;
                  const isCurrent = index === currentStepIndex;
                  return (
                    <motion.div
                      key={step.key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.3 }}
                    >
                      <div
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ${
                          isCompleted
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                            : isCurrent
                            ? 'bg-primary/5 dark:bg-primary/10 border-primary/30 shadow-sm'
                            : 'bg-muted/20 border-transparent'
                        }`}
                      >
                        {/* Step indicator */}
                        <div className="flex-shrink-0">
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors duration-300 ${
                              isCompleted
                                ? 'bg-emerald-500 text-white'
                                : isCurrent
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : isCurrent ? (
                              <motion.div
                                animate={{ scale: [1, 1.15, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              >
                                <Circle className="h-4 w-4 fill-current" />
                              </motion.div>
                            ) : (
                              <Circle className="h-4 w-4" />
                            )}
                          </div>
                        </div>

                        {/* Step content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${isCurrent ? 'text-primary' : isCompleted ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                              {step.label}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                : isCurrent
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {step.estimatedTime}
                            </span>
                          </div>
                          <p className={`text-[11px] ${isCurrent ? 'text-foreground/80' : 'text-muted-foreground'}`}>
                            {step.description}
                          </p>
                        </div>

                        {/* Status indicator */}
                        <div className="flex-shrink-0">
                          {isCompleted && (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                              Done
                            </Badge>
                          )}
                          {isCurrent && (
                            <Badge className="bg-primary/10 text-primary text-[10px]">
                              Current
                            </Badge>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
          {workflow && (
            <div className="mt-4">
              <Progress value={workflow.progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                Step {workflow.stepsCompleted} of {workflow.totalSteps} ({workflow.progressPercent}%)
              </p>
            </div>
          )}
        </div>

        {/* Provider Results */}
        {onboardingData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {onboardingData.identityResult && (
              <Card className="p-3">
                <h5 className="text-xs font-semibold text-muted-foreground mb-2">Identity Verification</h5>
                <pre className="text-[10px] overflow-auto max-h-32 bg-muted/30 rounded p-2">
                  {JSON.stringify(onboardingData.identityResult, null, 2)}
                </pre>
              </Card>
            )}
            {onboardingData.sanctionsResult && (
              <Card className="p-3">
                <h5 className="text-xs font-semibold text-muted-foreground mb-2">Sanctions Screening</h5>
                <pre className="text-[10px] overflow-auto max-h-32 bg-muted/30 rounded p-2">
                  {JSON.stringify(onboardingData.sanctionsResult, null, 2)}
                </pre>
              </Card>
            )}
            {onboardingData.kybResult && (
              <Card className="p-3">
                <h5 className="text-xs font-semibold text-muted-foreground mb-2">KYB Verification</h5>
                <pre className="text-[10px] overflow-auto max-h-32 bg-muted/30 rounded p-2">
                  {JSON.stringify(onboardingData.kybResult, null, 2)}
                </pre>
              </Card>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleAdvance} disabled={initiateOnboarding.isPending || advanceOnboarding.isPending}>
            {(initiateOnboarding.isPending || advanceOnboarding.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {!caseId ? 'Start Onboarding' : 'Advance Workflow'}
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}
