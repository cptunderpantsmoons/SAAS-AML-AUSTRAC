'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ArrowRight,
  AlertTriangle,
  FolderOpen,
  Building2,
  User,
  Shield,
  Activity,
  DollarSign,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useClients, useAuditLogs, useAlerts, useTransactions } from '@/hooks/useApi';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClientProfilePanelProps {
  clientId: string | null;
  onClose: () => void;
  onNavigate?: (section: string) => void;
}

interface TimelineEvent {
  id: string;
  timestamp: string;
  action: string;
  description: string;
  entityType: string;
  color: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ENTITY_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  individual: { label: 'Individual', icon: User, className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-sky-200 dark:border-sky-800' },
  company: { label: 'Company', icon: Building2, className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-violet-200 dark:border-violet-800' },
  trust: { label: 'Trust', icon: Shield, className: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border-teal-200 dark:border-teal-800' },
  partnership: { label: 'Partnership', icon: Building2, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
};

function formatAUD(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function getTimelineColor(action: string): string {
  const upper = action.toUpperCase();
  if (upper.includes('CREATE') || upper.includes('CREATED') || upper.includes('VERIFY') || upper.includes('COMPLETE'))
    return 'bg-emerald-500';
  if (upper.includes('ALERT') || upper.includes('ESCALAT') || upper.includes('FLAG'))
    return 'bg-red-500';
  if (upper.includes('REPORT') || upper.includes('SUBMIT') || upper.includes('APPROV'))
    return 'bg-blue-500';
  if (upper.includes('UPDATE') || upper.includes('UPDAT') || upper.includes('MODIF'))
    return 'bg-amber-500';
  if (upper.includes('DOCUMENT') || upper.includes('ANALYZ'))
    return 'bg-teal-500';
  if (upper.includes('TRANSACTION') || upper.includes('DEPOSIT') || upper.includes('WITHDRAW') || upper.includes('TRANSFER'))
    return 'bg-indigo-500';
  return 'bg-slate-400';
}

function getActionLabel(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function riskScoreColor(score: number): string {
  if (score >= 0.75) return 'text-red-600 dark:text-red-400';
  if (score >= 0.5) return 'text-orange-600 dark:text-orange-400';
  if (score >= 0.25) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ClientProfilePanel({ clientId, onClose, onNavigate }: ClientProfilePanelProps) {
  // Fetch client data
  const { data: clientsData, isLoading: clientsLoading } = useClients({ limit: 1000 });
  const { data: auditData } = useAuditLogs({ limit: 50 });
  const { data: alertsData } = useAlerts({ limit: 100 });
  const { data: txData, isLoading: txLoading } = useTransactions(
    clientId ? { clientId, limit: 100 } : undefined
  );

  // Find the specific client
  const clientsList = clientsData?.clients;
  const client = useMemo(() => {
    if (!clientId || !clientsList) return null;
    return clientsList.find((c: Record<string, unknown>) => c.id === clientId) ?? null;
  }, [clientId, clientsList]);

  // Filter alerts for this client
  const alertsList = alertsData?.alerts;
  const clientAlerts = useMemo(() => {
    if (!clientId || !alertsList) return [];
    return alertsList.filter((a: Record<string, unknown>) => a.clientId === clientId);
  }, [clientId, alertsList]);

  // Filter audit logs for this client
  const auditLogs = auditData?.logs;
  const clientAuditLogs = useMemo(() => {
    if (!clientId || !auditLogs) return [];
    return auditLogs.filter(
      (log: Record<string, unknown>) => log.entityId === clientId
    );
  }, [clientId, auditLogs]);

  // Client transactions
  const clientTransactions = useMemo(() => {
    return txData?.transactions ?? [];
  }, [txData?.transactions]);

  // Compute KPI metrics
  const metrics = useMemo(() => {
    const totalTransactions = clientTransactions.length;
    const totalAmount = clientTransactions.reduce(
      (sum: number, t: Record<string, unknown>) => sum + ((t.amount as number) ?? 0),
      0
    );
    const avgRiskScore = clientTransactions.length > 0
      ? clientTransactions.reduce(
          (sum: number, t: Record<string, unknown>) => sum + ((t.riskScore as number) ?? 0),
          0
        ) / clientTransactions.length
      : 0;
    const activeAlerts = clientAlerts.filter(
      (a: Record<string, unknown>) => a.status === 'open' || a.status === 'investigating'
    ).length;

    return { totalTransactions, totalAmount, avgRiskScore, activeAlerts };
  }, [clientTransactions, clientAlerts]);

  // Build unified timeline
  const timeline = useMemo(() => {
    const events: TimelineEvent[] = [];

    // Add audit log events
    clientAuditLogs.forEach((log: Record<string, unknown>) => {
      events.push({
        id: `audit-${log.id as string}`,
        timestamp: log.createdAt as string,
        action: log.action as string,
        description: `${log.action as string} on ${(log.entityType as string) ?? 'entity'}`,
        entityType: (log.entityType as string) ?? 'System',
        color: getTimelineColor(log.action as string),
      });
    });

    // Add alert events
    clientAlerts.forEach((alert: Record<string, unknown>) => {
      events.push({
        id: `alert-${alert.id as string}`,
        timestamp: alert.createdAt as string,
        action: alert.alertType as string,
        description: (alert.description as string) ?? `Alert: ${alert.alertType as string}`,
        entityType: 'Alert',
        color: getTimelineColor('ALERT'),
      });
    });

    // Add recent transaction events
    clientTransactions.slice(0, 5).forEach((tx: Record<string, unknown>) => {
      const action = `${(tx.direction as string) ?? ''} ${(tx.transactionType as string) ?? 'transaction'}`.trim();
      events.push({
        id: `tx-${tx.id as string}`,
        timestamp: tx.transactionDate as string,
        action: action.toUpperCase().replace(/ /g, '_'),
        description: `${formatAUD((tx.amount as number) ?? 0)} ${(tx.currency as string) ?? 'AUD'} ${tx.direction === 'outbound' ? 'to' : 'from'} ${(tx.counterparty as string) ?? 'unknown'}`,
        entityType: 'Transaction',
        color: getTimelineColor('TRANSACTION'),
      });
    });

    // Sort by timestamp descending, take top 10
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events.slice(0, 10);
  }, [clientAuditLogs, clientAlerts, clientTransactions]);

  // Entity type display config
  const entityTypeKey = (client?.entityType as string ?? 'individual').toLowerCase();
  const entityConfig = ENTITY_TYPE_CONFIG[entityTypeKey] ?? ENTITY_TYPE_CONFIG.individual;
  const EntityIcon = entityConfig.icon;

  const isOpen = clientId !== null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Slide-over panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 h-full w-full sm:w-[420px] bg-background border-l border-border shadow-2xl flex flex-col"
          >
            {/* ─── Header ─── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-muted/60 to-muted/30">
              <div className="flex-1 min-w-0 mr-3">
                {clientsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ) : client ? (
                  <>
                    <h2 className="text-lg font-bold truncate">{client.fullName as string}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {(client.clientId as string) ?? clientId}
                    </p>
                  </>
                ) : (
                  <h2 className="text-lg font-bold text-muted-foreground">Client not found</h2>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full shrink-0 hover:bg-muted"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close panel</span>
              </Button>
            </div>

            {/* ─── Scrollable Content ─── */}
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-5">
                {/* ─── Client Badges ─── */}
                {client && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Badge variant="outline" className={`${entityConfig.className} font-medium text-xs gap-1`}>
                      <EntityIcon className="h-3 w-3" />
                      {entityConfig.label}
                    </Badge>
                    <RiskBadge
                      level={(client.riskRating as string) ?? 'low'}
                      score={typeof client.riskRating === 'string' ? undefined : undefined}
                    />
                    <StatusBadge status={(client.onboardingStatus as string) ?? 'pending'} />
                  </motion.div>
                )}

                <Separator />

                {/* ─── Key Metrics 2×2 Grid ─── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.3 }}
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Key Metrics
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Total Transactions */}
                    <Card className="p-3 bg-gradient-to-br from-sky-50/80 to-white dark:from-sky-950/20 dark:to-card border-sky-200/60 dark:border-sky-800/40">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400">
                          <Activity className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">Transactions</span>
                      </div>
                      <p className="text-xl font-bold">
                        {txLoading ? <Skeleton className="h-7 w-12 inline-block" /> : metrics.totalTransactions}
                      </p>
                    </Card>

                    {/* Total Amount */}
                    <Card className="p-3 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-card border-emerald-200/60 dark:border-emerald-800/40">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                          <DollarSign className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">Total Amount</span>
                      </div>
                      <p className="text-xl font-bold">
                        {txLoading ? (
                          <Skeleton className="h-7 w-20 inline-block" />
                        ) : (
                          metrics.totalAmount >= 1000000
                            ? `$${(metrics.totalAmount / 1000000).toFixed(1)}M`
                            : formatAUD(metrics.totalAmount)
                        )}
                      </p>
                    </Card>

                    {/* Risk Score */}
                    <Card className="p-3 bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-card border-amber-200/60 dark:border-amber-800/40">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                          <TrendingUp className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">Risk Score</span>
                      </div>
                      <p className={`text-xl font-bold ${riskScoreColor(metrics.avgRiskScore)}`}>
                        {txLoading ? (
                          <Skeleton className="h-7 w-12 inline-block" />
                        ) : (
                          `${(metrics.avgRiskScore * 100).toFixed(0)}%`
                        )}
                      </p>
                    </Card>

                    {/* Active Alerts */}
                    <Card className="p-3 bg-gradient-to-br from-red-50/80 to-white dark:from-red-950/20 dark:to-card border-red-200/60 dark:border-red-800/40">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                          <AlertCircle className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">Active Alerts</span>
                      </div>
                      <p className={`text-xl font-bold ${metrics.activeAlerts > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {metrics.activeAlerts}
                      </p>
                    </Card>
                  </div>
                </motion.div>

                <Separator />

                {/* ─── Activity Timeline ─── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Activity Timeline
                  </h3>

                  {timeline.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No activity recorded
                    </div>
                  ) : (
                    <div className="relative pl-6">
                      {/* Vertical connecting line */}
                      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

                      <div className="space-y-0">
                        {timeline.map((event, idx) => (
                          <motion.div
                            key={event.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.25 + idx * 0.04, duration: 0.25 }}
                            className="relative flex gap-3 pb-4 last:pb-0"
                          >
                            {/* Dot */}
                            <div className="absolute -left-6 top-1.5 flex items-center justify-center">
                              <div className={`h-3 w-3 rounded-full ${event.color} ring-2 ring-background shrink-0 z-10`} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium leading-tight truncate">
                                    {getActionLabel(event.action)}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                    {event.description}
                                  </p>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                                  {getRelativeTime(event.timestamp)}
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className="mt-1 text-[9px] h-4 px-1.5 font-normal bg-muted/40 border-muted-foreground/20"
                              >
                                {event.entityType}
                              </Badge>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>

                <Separator />

                {/* ─── Quick Actions ─── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Quick Actions
                  </h3>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-between gap-2 h-10 group hover:bg-sky-50 hover:border-sky-200 hover:text-sky-700 dark:hover:bg-sky-950/30 dark:hover:border-sky-800 dark:hover:text-sky-400 transition-all duration-200"
                      onClick={() => onNavigate?.('transactions')}
                    >
                      <span className="flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        View All Transactions
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-between gap-2 h-10 group hover:bg-red-50 hover:border-red-200 hover:text-red-700 dark:hover:bg-red-950/30 dark:hover:border-red-800 dark:hover:text-red-400 transition-all duration-200"
                      onClick={() => onNavigate?.('monitoring')}
                    >
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        View Alerts
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-between gap-2 h-10 group hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:border-emerald-800 dark:hover:text-emerald-400 transition-all duration-200"
                      onClick={() => onNavigate?.('documents')}
                    >
                      <span className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        View Documents
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Button>
                  </div>
                </motion.div>
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
