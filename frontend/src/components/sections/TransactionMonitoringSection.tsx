'use client';

import React, { useState, useMemo } from 'react';
import { useTransactions, useMonitoringRules, useAlerts, useUpdateAlert, useCreateRule } from '@/hooks/useApi';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Activity, Plus, Loader2, ArrowUpRight, ArrowDownRight, ToggleLeft, ToggleRight, DollarSign, AlertTriangle, BarChart3, Hash, Clock, Download, Eye, Search, ShieldAlert, User, XCircle, Bell, CheckCircle2, AlertCircle, ChevronUp, Flag, FileOutput, Briefcase, X, ChevronRight, Link2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const SEVERITY_STYLES: Record<string, { border: string; bg: string; barColor: string }> = {
  low: { border: 'border-l-emerald-500', bg: 'bg-emerald-50/50 dark:bg-emerald-950/10', barColor: 'bg-emerald-500' },
  medium: { border: 'border-l-amber-500', bg: 'bg-amber-50/50 dark:bg-amber-950/10', barColor: 'bg-amber-500' },
  high: { border: 'border-l-orange-500', bg: 'bg-orange-50/50 dark:bg-orange-950/10', barColor: 'bg-orange-500' },
  critical: { border: 'border-l-red-500', bg: 'bg-red-50/50 dark:bg-red-950/10', barColor: 'bg-red-500' },
};

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-AU');
}

// ── Mini Risk Meter Bar ──

function RiskMeterBar({ score, showLabel = true }: { score: number; showLabel?: boolean }) {
  const color = score >= 0.5 ? '#ef4444' : score >= 0.3 ? '#f59e0b' : '#10b981';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(score * 100, 2)}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="text-[11px] font-medium tabular-nums" style={{ color }}>
          {(score * 100).toFixed(0)}%
        </span>
      )}
    </div>
  );
}

// ── Risk Score Breakdown Bar (for Investigation Dialog) ──

function RiskScoreBreakdown({ score }: { score: number }) {
  const color = score >= 0.5 ? '#ef4444' : score >= 0.3 ? '#f59e0b' : '#10b981';
  const label = score >= 0.7 ? 'Critical' : score >= 0.5 ? 'High' : score >= 0.3 ? 'Medium' : 'Low';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Risk Score</span>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs"
            style={{ borderColor: color, color }}
          >
            {label}
          </Badge>
          <span className="text-sm font-bold tabular-nums" style={{ color }}>
            {(score * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #10b981, #f59e0b, #ef4444)' }}>
        <div
          className="absolute top-0 h-full w-0.5 bg-white shadow-sm"
          style={{ left: `${score * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white shadow-md"
          style={{ left: `${score * 100}%`, transform: `translate(-50%, -50%)`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Low (0%)</span>
        <span>Medium (50%)</span>
        <span>Critical (100%)</span>
      </div>
    </div>
  );
}

// ── Format Conditions Helper ──

/** Format a key: replace underscores with spaces, capitalize each word */
function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1') // camelCase to spaces
    .replace(/_/g, ' ')          // snake_case to spaces
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Format a monetary value with currency */
function formatCurrencyValue(value: number, currency?: string): string {
  const formatted = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency ?? 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
  return formatted;
}

/** Format a single condition value contextually */
function formatConditionValue(key: string, value: unknown, fullObj: Record<string, unknown>): React.ReactNode {
  // Handle field + operator + value pattern: "Amount is ≥ $10,000 AUD"
  if (key === 'field' && typeof value === 'string') {
    const operator = fullObj.operator as string | undefined;
    const ruleValue = fullObj.value as number | undefined;
    const currency = fullObj.currency as string | undefined;
    const fieldLabel = formatKey(value);

    if (operator && ruleValue !== undefined) {
      const operatorSymbol = operator === '>=' ? '≥' : operator === '<=' ? '≤' : operator === '>' ? '>' : operator === '<' ? '<' : operator === '==' ? '=' : operator === '!=' ? '≠' : operator === 'in' ? 'in' : operator;
      if (value === 'amount' || value === 'minAmount') {
        return (
          <span className="text-sm">
            {fieldLabel} is {operatorSymbol} {formatCurrencyValue(ruleValue, currency)}
          </span>
        );
      }
      return (
        <span className="text-sm">
          {fieldLabel} is {operatorSymbol} {String(ruleValue)}
        </span>
      );
    }
    return <span className="text-sm">{fieldLabel}</span>;
  }

  // Skip operator and value keys if they were already rendered as part of the field pattern
  if (key === 'operator' && fullObj.field) return null;
  if (key === 'value' && fullObj.field && fullObj.operator) return null;
  if (key === 'currency' && fullObj.field && fullObj.operator) return null;

  // Handle direction → "Direction: Outbound"
  if (key === 'direction' && typeof value === 'string') {
    return (
      <span className="text-sm">
        Direction: {value.charAt(0).toUpperCase() + value.slice(1)}
      </span>
    );
  }

  // Handle countThreshold + windowHours → "3+ occurrences in 48 hours"
  if (key === 'countThreshold' && typeof value === 'number') {
    const windowHours = fullObj.windowHours as number | undefined;
    if (windowHours !== undefined) {
      return (
        <span className="text-sm">
          {value}+ occurrences in {windowHours} hours
        </span>
      );
    }
    return <span className="text-sm">{value}+ occurrences</span>;
  }

  // Skip windowHours if already rendered as part of countThreshold
  if (key === 'windowHours' && fullObj.countThreshold !== undefined) return null;

  // Handle minAmount → "Minimum: $5,000"
  if (key === 'minAmount' && typeof value === 'number') {
    const currency = fullObj.currency as string | undefined;
    return (
      <span className="text-sm">
        Minimum: {formatCurrencyValue(value, currency)}
      </span>
    );
  }

  // Handle arrays → comma-separated list
  if (Array.isArray(value)) {
    return (
      <span className="text-sm">
        {value.map(String).join(', ')}
      </span>
    );
  }

  // Handle pattern
  if (key === 'pattern' && typeof value === 'string') {
    return (
      <span className="text-sm">
        Pattern: {formatKey(value)}
      </span>
    );
  }

  // Handle threshold
  if (key === 'threshold' && typeof value === 'number') {
    return (
      <span className="text-sm">
        Threshold: {value}
      </span>
    );
  }

  // Handle transactionType
  if (key === 'transactionType' && typeof value === 'string') {
    return (
      <span className="text-sm">
        Transaction Type: {formatKey(value)}
      </span>
    );
  }

  // Handle values key (for sanctions "in" operator)
  if (key === 'values' && Array.isArray(value)) {
    return (
      <span className="text-sm">
        {value.map(String).join(', ')}
      </span>
    );
  }

  // Default: format key and value
  if (typeof value === 'number') {
    // Check if it might be a monetary value based on key name
    if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('value')) {
      return <span className="text-sm">{formatCurrencyValue(value)}</span>;
    }
    return <span className="text-sm">{String(value)}</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <Badge variant={value ? 'default' : 'outline'} className="text-[10px]">
        {value ? 'Yes' : 'No'}
      </Badge>
    );
  }

  if (typeof value === 'string') {
    return <span className="text-sm">{formatKey(value)}</span>;
  }

  // Objects: recurse
  if (typeof value === 'object' && value !== null) {
    return formatConditionsFromObj(value as Record<string, unknown>);
  }

  return <span className="text-sm">{String(value)}</span>;
}

/** Format conditions from a parsed object into a grid of key-value pairs */
function formatConditionsFromObj(obj: Record<string, unknown>): React.ReactNode {
  const entries = Object.entries(obj);
  const renderedPairs: { key: string; node: React.ReactNode }[] = [];

  for (const [key, value] of entries) {
    const node = formatConditionValue(key, value, obj);
    if (node !== null) {
      renderedPairs.push({ key, node });
    }
  }

  if (renderedPairs.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
      {renderedPairs.map(({ key, node }) => (
        <div key={key} className="flex items-start gap-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap pt-0.5 min-w-[80px]">
            {formatKey(key)}
          </span>
          <span className="text-sm">{node}</span>
        </div>
      ))}
    </div>
  );
}

/** Main formatConditions function: parse JSON string and render readable view */
function formatConditions(conditionsStr: string): React.ReactNode {
  try {
    const parsed = JSON.parse(conditionsStr);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return formatConditionsFromObj(parsed as Record<string, unknown>);
    }
    // If it's an array or primitive after parsing, show formatted
    return (
      <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 max-w-xl overflow-auto whitespace-pre-wrap">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    // Parsing failed — show raw string in a styled code block
    return (
      <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 max-w-xl overflow-auto whitespace-pre-wrap">
        {conditionsStr}
      </pre>
    );
  }
}

// ── CSV Export Utility ──

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

// ── Investigation Dialog ──

function InvestigationDialog({
  transaction,
  allTransactions,
  open,
  onOpenChange,
  onClientSelect,
}: {
  transaction: Record<string, unknown> | null;
  allTransactions: Array<Record<string, unknown>>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientSelect?: (clientId: string) => void;
}) {
  const client = transaction?.client as Record<string, unknown> | undefined;
  const clientId = client?.id as string | undefined;
  const riskScore = (transaction?.riskScore as number) ?? 0;

  const similarTransactions = useMemo(() => {
    if (!transaction || !clientId) return [];
    return allTransactions.filter(
      (tx) =>
        (tx.client as Record<string, unknown>)?.id === clientId &&
        (tx.id as string) !== (transaction.id as string)
    );
  }, [transaction, allTransactions, clientId]);

  const formatAUD = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-red-500" />
            Transaction Investigation
          </DialogTitle>
          <DialogDescription className="text-xs font-mono text-muted-foreground">
            ID: {(transaction.transactionId as string) ?? '—'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 pb-4">
            {/* Transaction Details */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Transaction Details
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 bg-muted/30 rounded-lg p-4 border">
                <DetailRow label="Transaction ID" value={(transaction.transactionId as string)?.slice(-12) ?? '—'} mono />
                <DetailRow label="Type" value={((transaction.transactionType as string) ?? '—').replace(/\b\w/g, c => c.toUpperCase())} />
                <DetailRow label="Amount" value={formatAUD(transaction.amount as number)} bold />
                <DetailRow label="Direction" value={(transaction.direction as string) === 'inbound' ? 'Inbound' : 'Outbound'} />
                <DetailRow label="Counterparty" value={(transaction.counterparty as string) ?? '—'} />
                <DetailRow label="Date" value={transaction.transactionDate ? new Date(transaction.transactionDate as string).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
                <DetailRow label="Risk Score" value={`${(riskScore * 100).toFixed(0)}%`} />
                <DetailRow
                  label="Flagged"
                  value={transaction.flagged ? 'Yes' : 'No'}
                  valueClassName={transaction.flagged ? 'text-red-600 dark:text-red-400 font-semibold' : ''}
                />
              </div>
            </div>

            {/* Client Details */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Client Details
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 bg-muted/30 rounded-lg p-4 border">
                <DetailRow label="Name" value={(client?.fullName as string) ?? '—'} />
                <DetailRow label="Risk Rating">
                  <RiskBadge level={(client?.riskRating as string) ?? 'low'} />
                </DetailRow>
                <DetailRow label="Entity Type" value={((client?.entityType as string) ?? '—').replace(/\b\w/g, c => c.toUpperCase())} />
                <DetailRow label="Client ID" value={(client?.clientId as string)?.slice(-12) ?? (client?.id as string)?.slice(-8) ?? '—'} mono />
              </div>
            </div>

            {/* Risk Score Breakdown */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Risk Score Breakdown
              </h4>
              <div className="bg-muted/30 rounded-lg p-4 border">
                <RiskScoreBreakdown score={riskScore} />
              </div>
            </div>

            {/* Similar Transactions */}
            {similarTransactions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  Similar Transactions
                  <Badge variant="outline" className="text-[10px]">{similarTransactions.length}</Badge>
                </h4>
                <div className="bg-muted/30 rounded-lg border overflow-hidden">
                  <div className="max-h-48 overflow-y-auto custom-scrollbar">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-8">ID</TableHead>
                          <TableHead className="text-[10px] h-8">Type</TableHead>
                          <TableHead className="text-[10px] h-8">Amount</TableHead>
                          <TableHead className="text-[10px] h-8">Risk</TableHead>
                          <TableHead className="text-[10px] h-8">Flagged</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {similarTransactions.map((tx) => (
                          <TableRow key={tx.id as string} className="text-xs">
                            <TableCell className="font-mono text-[11px]">{(tx.transactionId as string)?.slice(-8)}</TableCell>
                            <TableCell className="capitalize text-[11px]">{(tx.transactionType as string) ?? ''}</TableCell>
                            <TableCell className="font-medium text-[11px]">{formatAUD(tx.amount as number)}</TableCell>
                            <TableCell><RiskMeterBar score={(tx.riskScore as number) ?? 0} /></TableCell>
                            <TableCell>
                              {(tx.flagged as boolean) ? (
                                <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">FLAGGED</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">Clear</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Action Buttons */}
        <DialogFooter className="flex-row gap-2 sm:gap-2 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast.success('Transaction marked for review');
              onOpenChange(false);
            }}
          >
            <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
            Mark for Review
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast.success('Flag dismissed');
              onOpenChange(false);
            }}
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Dismiss Flag
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast.success('Alert created');
              onOpenChange(false);
            }}
          >
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            Create Alert
          </Button>
          {client?.id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClientSelect?.(client.id as string);
                onOpenChange(false);
              }}
            >
              <User className="h-3.5 w-3.5 mr-1.5" />
              View Client
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value, mono, bold, valueClassName, children }: {
  label: string;
  value?: string;
  mono?: boolean;
  bold?: boolean;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      {children ?? (
        <span className={`text-sm ${mono ? 'font-mono' : ''} ${bold ? 'font-semibold' : ''} ${valueClassName ?? ''}`}>
          {value}
        </span>
      )}
    </div>
  );
}

// ── Transaction Detail Slide-In Panel ──

function TransactionDetailPanel({
  transaction,
  open,
  onClose,
  onClientSelect,
  allTransactions,
}: {
  transaction: Record<string, unknown> | null;
  open: boolean;
  onClose: () => void;
  onClientSelect?: (clientId: string) => void;
  allTransactions: Array<Record<string, unknown>>;
}) {
  const client = transaction?.client as Record<string, unknown> | undefined;
  const riskScore = (transaction?.riskScore as number) ?? 0;
  const formatAUD = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);

  // Find linked alerts for this transaction's client
  const linkedTransactions = useMemo(() => {
    if (!transaction || !client?.id) return [];
    return allTransactions.filter(
      (tx) =>
        (tx.client as Record<string, unknown>)?.id === (client.id as string) &&
        (tx.id as string) !== (transaction.id as string)
    ).slice(0, 5);
  }, [transaction, allTransactions, client?.id]);

  // Mock timeline events
  const timelineEvents = useMemo(() => {
    if (!transaction) return [];
    const events = [
      { time: transaction.transactionDate ?? transaction.createdAt, label: 'Transaction Created', icon: Activity, color: 'text-sky-500' },
    ];
    if (transaction.flagged) {
      events.push({ time: transaction.updatedAt ?? transaction.createdAt, label: 'Flagged by Rule Engine', icon: Flag, color: 'text-red-500' });
    }
    if (riskScore > 0.5) {
      events.push({ time: transaction.updatedAt ?? transaction.createdAt, label: 'High Risk Alert Generated', icon: AlertTriangle, color: 'text-amber-500' });
    }
    events.push({ time: new Date().toISOString(), label: 'Review Pending', icon: Clock, color: 'text-muted-foreground' });
    return events;
  }, [transaction, riskScore]);

  if (!transaction) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-card border-l border-border z-50 shadow-2xl overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">Transaction Details</h3>
                <p className="text-[10px] font-mono text-muted-foreground">{(transaction.transactionId as string)?.slice(-12) ?? '—'}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-5">
              {/* Amount & Risk */}
              <div className="flex items-center gap-4">
                <div className="flex-1 p-3 rounded-xl bg-muted/30 border">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Amount</div>
                  <div className="text-xl font-bold">{formatAUD(transaction.amount as number)}</div>
                </div>
                <div className="flex-1 p-3 rounded-xl bg-muted/30 border">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Risk Score</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold" style={{ color: riskScore >= 0.5 ? '#ef4444' : riskScore >= 0.3 ? '#f59e0b' : '#10b981' }}>
                      {(riskScore * 100).toFixed(0)}%
                    </span>
                    <RiskBadge level={riskScore >= 0.7 ? 'critical' : riskScore >= 0.5 ? 'high' : riskScore >= 0.3 ? 'medium' : 'low'} />
                  </div>
                </div>
              </div>

              {/* Risk Score Breakdown */}
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                  Risk Score Breakdown
                </h4>
                <div className="bg-muted/30 rounded-lg p-3 border">
                  <RiskScoreBreakdown score={riskScore} />
                </div>
              </div>

              {/* Full Transaction Details */}
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  Transaction Details
                </h4>
                <div className="bg-muted/30 rounded-lg p-3 border space-y-2">
                  <DetailRow label="Type" value={((transaction.transactionType as string) ?? '—').replace(/\b\w/g, c => c.toUpperCase())} />
                  <DetailRow label="Direction" value={(transaction.direction as string) === 'inbound' ? 'Inbound' : 'Outbound'} />
                  <DetailRow label="Counterparty" value={(transaction.counterparty as string) ?? '—'} />
                  <DetailRow label="Date" value={transaction.transactionDate ? new Date(transaction.transactionDate as string).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
                  <DetailRow label="Flagged" value={transaction.flagged ? 'Yes' : 'No'} valueClassName={transaction.flagged ? 'text-red-600 dark:text-red-400 font-semibold' : ''} />
                </div>
              </div>

              {/* Client Info */}
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Client Details
                </h4>
                <div className="bg-muted/30 rounded-lg p-3 border space-y-2">
                  <DetailRow label="Name" value={(client?.fullName as string) ?? '—'} />
                  <DetailRow label="Risk Rating">
                    <RiskBadge level={(client?.riskRating as string) ?? 'low'} />
                  </DetailRow>
                  <DetailRow label="Entity Type" value={((client?.entityType as string) ?? '—').replace(/\b\w/g, c => c.toUpperCase())} />
                </div>
              </div>

              {/* Rule Matches */}
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                  Rule Matches
                </h4>
                <div className="bg-muted/30 rounded-lg p-3 border">
                  {transaction.flagged ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        <span className="text-xs font-medium">High Value Transaction Rule</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-amber-500" />
                        <span className="text-xs font-medium">Structuring Detection</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No rule matches for this transaction</p>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="text-xs font-semibold mb-2">Event Timeline</h4>
                <div className="space-y-0">
                  {timelineEvents.map((event, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <event.icon className={`h-4 w-4 ${event.color} shrink-0`} />
                        {idx < timelineEvents.length - 1 && (
                          <div className="w-px h-6 bg-border" />
                        )}
                      </div>
                      <div className="pb-3">
                        <p className="text-xs font-medium">{event.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(event.time).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linked Alerts */}
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                  Linked Alerts
                </h4>
                <div className="bg-muted/30 rounded-lg p-3 border">
                  {transaction.flagged ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <div>
                        <p className="text-xs font-semibold text-red-700 dark:text-red-400">High Risk Alert</p>
                        <p className="text-[10px] text-muted-foreground">Triggered by rule match</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No linked alerts</p>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="sticky bottom-0 bg-card/95 backdrop-blur-sm border-t p-4 flex gap-2">
              {client?.id && (
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { onClientSelect?.(client.id as string); onClose(); }}>
                  <User className="h-3.5 w-3.5 mr-1.5" />
                  View Client
                </Button>
              )}
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { toast.success('Showing related transactions'); onClose(); }}>
                <Link2 className="h-3.5 w-3.5 mr-1.5" />
                Related Txns
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Risk Score Distribution Heatmap ──

function RiskDistributionHeatmap() {
  const { data } = useTransactions({ page: 1, limit: 100 });
  const transactions = (data?.transactions ?? []) as Array<Record<string, unknown>>;

  const riskDistribution = useMemo(() => {
    const ranges = [
      { label: 'Low', range: '0-20%', min: 0, max: 0.2, color: '#10b981', bgClass: 'bg-emerald-500' },
      { label: 'Medium', range: '21-40%', min: 0.2, max: 0.4, color: '#f59e0b', bgClass: 'bg-amber-500' },
      { label: 'Elevated', range: '41-60%', min: 0.4, max: 0.6, color: '#f97316', bgClass: 'bg-orange-500' },
      { label: 'High', range: '61-80%', min: 0.6, max: 0.8, color: '#ef4444', bgClass: 'bg-red-500' },
      { label: 'Critical', range: '81-100%', min: 0.8, max: 1.0, color: '#dc2626', bgClass: 'bg-red-600' },
    ];
    const total = transactions.length || 1;
    return ranges.map(r => {
      const count = transactions.filter(tx => {
        const score = (tx.riskScore as number) ?? 0;
        return score >= r.min && (r.max === 1.0 ? score <= r.max : score < r.max);
      }).length;
      return { ...r, count, pct: Math.round((count / total) * 100) };
    });
  }, [transactions]);

  if (transactions.length === 0) return null;

  const maxCount = Math.max(...riskDistribution.map(r => r.count), 1);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Risk Score Distribution
        </h3>
        <Badge variant="outline" className="text-xs">{transactions.length} transactions</Badge>
      </div>
      <div className="space-y-2.5">
        {riskDistribution.map((range, idx) => (
          <div key={range.label} className="flex items-center gap-3">
            <div className="w-20 shrink-0 text-right">
              <span className="text-xs font-semibold" style={{ color: range.color }}>{range.label}</span>
              <span className="text-[10px] text-muted-foreground ml-1">{range.range}</span>
            </div>
            <div className="flex-1 h-6 bg-muted/20 rounded-md overflow-hidden relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${range.count > 0 ? Math.max((range.count / maxCount) * 100, 8) : 0}%` }}
                transition={{ duration: 0.6, delay: idx * 0.08, ease: 'easeOut' }}
                className="h-full rounded-md"
                style={{ backgroundColor: range.color, opacity: 0.8 }}
              />
              {range.count > 0 && (
                <span className="absolute inset-0 flex items-center pl-2 text-[10px] font-bold text-white mix-blend-difference">
                  {range.count}
                </span>
              )}
            </div>
            <div className="w-16 shrink-0 text-right">
              <span className="text-xs font-bold tabular-nums">{range.count}</span>
              <span className="text-[10px] text-muted-foreground ml-0.5">({range.pct}%)</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Main Component ──

interface TransactionMonitoringSectionProps {
  onClientSelect?: (clientId: string) => void;
}

export function TransactionMonitoringSection({ onClientSelect }: TransactionMonitoringSectionProps) {
  const { data: txData } = useTransactions({ page: 1, limit: 1 });
  const { data: rulesData } = useMonitoringRules();
  const { data: alertsData } = useAlerts({ page: 1, limit: 1 });

  const txCount = txData?.pagination?.total ?? 0;
  const rulesCount = (rulesData?.rules ?? []).length;
  const alertCount = alertsData?.pagination?.total ?? 0;

  return (
    <div className="space-y-6">
      <SectionHeader title="Transaction Monitoring" description="Rules, alerts, and transaction oversight" icon={Activity} />

      {/* Risk Score Distribution Heatmap */}
      <RiskDistributionHeatmap />

      <Tabs defaultValue="transactions">
        <TabsList className="w-full justify-start gap-1 bg-muted/50 p-1 rounded-lg">
          <TabsTrigger
            value="transactions"
            className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border-b-2 data-[state=active]:border-emerald-500"
          >
            <Activity className="h-3.5 w-3.5" />
            Transactions
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">{txCount}</Badge>
          </TabsTrigger>
          <TabsTrigger
            value="rules"
            className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border-b-2 data-[state=active]:border-amber-500"
          >
            <ToggleLeft className="h-3.5 w-3.5" />
            Rules
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">{rulesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger
            value="alerts"
            className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border-b-2 data-[state=active]:border-red-500"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Alerts
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">{alertCount}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transactions"><TransactionsTab onClientSelect={onClientSelect} /></TabsContent>
        <TabsContent value="rules"><RulesTab /></TabsContent>
        <TabsContent value="alerts"><AlertsTab onClientSelect={onClientSelect} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Transactions Tab ──

function TransactionsTab({ onClientSelect }: { onClientSelect?: (clientId: string) => void }) {
  const [page, setPage] = useState(1);
  const [flaggedOnly, setFlaggedOnly] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [investigationTx, setInvestigationTx] = useState<Record<string, unknown> | null>(null);
  const [investigationOpen, setInvestigationOpen] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [detailTx, setDetailTx] = useState<Record<string, unknown> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data, isLoading } = useTransactions({
    page,
    limit: 20,
    flagged: flaggedOnly || undefined,
    transactionType: typeFilter || undefined,
  });

  const rawTransactions = (data?.transactions ?? []) as Array<Record<string, unknown>>;
  const pagination = data?.pagination;

  // Client-side date filtering
  const transactions = useMemo(() => {
    let filtered = rawTransactions;
    if (dateFrom) {
      const from = new Date(dateFrom);
      filtered = filtered.filter((tx) => {
        const txDate = new Date((tx.transactionDate as string) ?? (tx.createdAt as string));
        return txDate >= from;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((tx) => {
        const txDate = new Date((tx.transactionDate as string) ?? (tx.createdAt as string));
        return txDate <= to;
      });
    }
    return filtered;
  }, [rawTransactions, dateFrom, dateTo]);

  const formatAUD = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);

  // Calculate summary stats
  const totalVolume = transactions.reduce((sum, tx) => sum + ((tx.amount as number) ?? 0), 0);
  const flaggedCount = transactions.filter((tx) => tx.flagged as boolean).length;
  const avgRiskScore = transactions.length > 0
    ? transactions.reduce((sum, tx) => sum + ((tx.riskScore as number) ?? 0), 0) / transactions.length
    : 0;

  const handleOpenInvestigation = (tx: Record<string, unknown>) => {
    setInvestigationTx(tx);
    setInvestigationOpen(true);
  };

  // ── CSV Export ──
  const exportCSV = () => {
    if (transactions.length === 0) {
      toast.error('No transactions to export');
      return;
    }

    const headers = [
      'Transaction ID',
      'Client Name',
      'Type',
      'Amount',
      'Direction',
      'Counterparty',
      'Risk Score',
      'Flagged',
    ];

    const rows = transactions.map((tx) => {
      const client = tx.client as Record<string, unknown> | undefined;
      return [
        (tx.transactionId as string) ?? '',
        (client?.fullName as string) ?? '',
        (tx.transactionType as string) ?? '',
        String(tx.amount ?? 0),
        (tx.direction as string) ?? '',
        (tx.counterparty as string) ?? '',
        String(tx.riskScore ?? 0),
        String(tx.flagged ?? false),
      ];
    });

    downloadCSV(
      `transactions-export-${new Date().toISOString().split('T')[0]}.csv`,
      headers,
      rows,
    );
    toast.success(`Exported ${transactions.length} transactions to CSV`);
  };

  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-800">
              <Hash className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{pagination?.total ?? transactions.length}</div>
              <div className="text-[10px] text-muted-foreground">Total Transactions</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-950/30">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{formatAUD(totalVolume)}</div>
              <div className="text-[10px] text-muted-foreground">Total Volume (AUD)</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/30">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{flaggedCount}</div>
              <div className="text-[10px] text-muted-foreground">Flagged</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-950/30">
              <BarChart3 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{(avgRiskScore * 100).toFixed(0)}%</div>
              <div className="text-[10px] text-muted-foreground">Avg Risk Score</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters + Export */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={flaggedOnly} onValueChange={setFlaggedOnly}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Txns" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Transactions</SelectItem>
              <SelectItem value="true">Flagged Only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="deposit">Deposit</SelectItem>
              <SelectItem value="withdrawal">Withdrawal</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="international">International</SelectItem>
            </SelectContent>
          </Select>
          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36 h-9 text-xs"
              placeholder="From"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36 h-9 text-xs"
              placeholder="To"
            />
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2"
                onClick={() => { setDateFrom(''); setDateTo(''); }}
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={transactions.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedTxIds.size === transactions.length && transactions.length > 0}
                        onCheckedChange={() => {
                          if (selectedTxIds.size === transactions.length) {
                            setSelectedTxIds(new Set());
                          } else {
                            setSelectedTxIds(new Set(transactions.map(tx => tx.id as string)));
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Risk Score</TableHead>
                    <TableHead>Flagged</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx: Record<string, unknown>, index: number) => {
                    const client = tx.client as Record<string, unknown> | undefined;
                    const isFlagged = tx.flagged as boolean;
                    const riskScore = (tx.riskScore as number) ?? 0;
                    const isSelected = selectedTxIds.has(tx.id as string);
                    return (
                      <TableRow
                        key={tx.id as string}
                        className={`table-row-hover ${isSelected ? 'bg-primary/5' : isFlagged ? 'cursor-pointer bg-red-50 dark:bg-red-950/10' : index % 2 === 1 ? 'bg-muted/10' : ''} transition-colors`}
                        onClick={() => {
                          setDetailTx(tx);
                          setDetailOpen(true);
                        }}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => {
                              setSelectedTxIds(prev => {
                                const next = new Set(prev);
                                if (next.has(tx.id as string)) next.delete(tx.id as string);
                                else next.add(tx.id as string);
                                return next;
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-mono">{(tx.transactionId as string)?.slice(-12)}</TableCell>
                        <TableCell className="text-sm">
                          <span
                            className={client ? 'cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors' : ''}
                            onClick={(e) => {
                              if (client?.id) {
                                e.stopPropagation();
                                onClientSelect?.(client.id as string);
                              }
                            }}
                          >
                            {(client?.fullName as string) ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs capitalize">{(tx.transactionType as string) ?? ''}</TableCell>
                        <TableCell className="text-sm font-medium">{formatAUD(tx.amount as number)}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-xs">
                            {(tx.direction as string) === 'inbound'
                              ? <><ArrowDownRight className="h-3 w-3 text-emerald-500" /> In</>
                              : <><ArrowUpRight className="h-3 w-3 text-red-500" /> Out</>
                            }
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{(tx.counterparty as string) ?? '—'}</TableCell>
                        <TableCell>
                          <RiskMeterBar score={riskScore} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {isFlagged ? (
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">FLAGGED</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">Clear</Badge>
                            )}
                            <Button
                              variant={isFlagged ? "destructive" : "outline"}
                              size="sm"
                              className={`h-7 gap-1 text-[10px] px-2 ${isFlagged ? 'bg-red-600 hover:bg-red-700 text-white' : 'hover:bg-muted'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setInvestigationTx(tx);
                                setInvestigationOpen(true);
                              }}
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedTxIds.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-2xl bg-card border border-border shadow-2xl"
          >
            <Badge className="bg-primary text-primary-foreground px-3 py-1 text-xs font-bold">
              {selectedTxIds.size} selected
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                toast.success(`${selectedTxIds.size} transactions flagged`);
                setSelectedTxIds(new Set());
              }}
            >
              <Flag className="h-3.5 w-3.5" />
              Flag Selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                toast.success(`${selectedTxIds.size} transactions exported`);
                setSelectedTxIds(new Set());
              }}
            >
              <FileOutput className="h-3.5 w-3.5" />
              Export Selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                toast.info('Case creation coming soon');
              }}
            >
              <Briefcase className="h-3.5 w-3.5" />
              Create Case
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={() => setSelectedTxIds(new Set())}
            >
              <X className="h-3.5 w-3.5" />
              Dismiss
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing {transactions.length} of {pagination.total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Investigation Dialog */}
      <InvestigationDialog
        transaction={investigationTx}
        allTransactions={rawTransactions}
        open={investigationOpen}
        onOpenChange={setInvestigationOpen}
        onClientSelect={onClientSelect}
      />

      {/* Transaction Detail Slide-In Panel */}
      <TransactionDetailPanel
        transaction={detailTx}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onClientSelect={onClientSelect}
        allTransactions={rawTransactions}
      />
    </div>
  );
}

// ── Rules Tab ──

function RulesTab() {
  const { data: rulesData, isLoading } = useMonitoringRules();
  const createRuleMutation = useCreateRule();
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRule, setNewRule] = useState({
    ruleName: '', ruleType: 'threshold', conditions: '', severity: 'medium',
  });

  const rules = (rulesData?.rules ?? []) as Array<Record<string, unknown>>;

  const handleCreateRule = async () => {
    if (!newRule.ruleName || !newRule.conditions) { toast.error('Name and conditions are required'); return; }
    try {
      let conditions = newRule.conditions;
      try { conditions = JSON.parse(newRule.conditions); } catch { /* use as string */ }
      await createRuleMutation.mutateAsync({ ...newRule, conditions });
      toast.success('Rule created');
      setShowNewRule(false);
    } catch {
      toast.error('Failed to create rule');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowNewRule(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> New Rule</Button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule: Record<string, unknown>) => (
            <Card key={rule.id as string} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium">{rule.ruleName as string}</span>
                    <RiskBadge level={(rule.severity as string) ?? 'medium'} />
                    <Badge variant="outline" className="text-[10px] capitalize">{(rule.ruleType as string) ?? ''}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span>Hits: {rule.hitCount as number}</span>
                    {rule.lastHitAt && <span className="ml-3">Last: {new Date(rule.lastHitAt as string).toLocaleDateString('en-AU')}</span>}
                    {rule.windowDays && <span className="ml-3">Window: {rule.windowDays as number}d</span>}
                  </div>
                  {/* Formatted conditions replacing raw JSON */}
                  <div className="mt-3 bg-muted/30 rounded-md p-3 border border-muted/50">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Conditions
                    </div>
                    {formatConditions(rule.conditions as string)}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {(rule.enabled as boolean) ? (
                    <ToggleRight className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New Rule Dialog */}
      <Dialog open={showNewRule} onOpenChange={setShowNewRule}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Monitoring Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Rule Name</label>
              <Input value={newRule.ruleName} onChange={(e) => setNewRule({ ...newRule, ruleName: e.target.value })} placeholder="e.g., High Value Transfer Rule" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Rule Type</label>
              <Select value={newRule.ruleType} onValueChange={(v) => setNewRule({ ...newRule, ruleType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="threshold">Threshold</SelectItem>
                  <SelectItem value="structuring">Structuring</SelectItem>
                  <SelectItem value="velocity">Velocity</SelectItem>
                  <SelectItem value="pattern">Pattern</SelectItem>
                  <SelectItem value="sanctions">Sanctions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Conditions (JSON)</label>
              <textarea
                className="w-full min-h-[80px] p-2 text-xs font-mono border rounded-md bg-background"
                value={newRule.conditions}
                onChange={(e) => setNewRule({ ...newRule, conditions: e.target.value })}
                placeholder='{"field": "amount", "operator": ">=", "value": 10000}'
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Severity</label>
              <Select value={newRule.severity} onValueChange={(v) => setNewRule({ ...newRule, severity: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreateRule} disabled={createRuleMutation.isPending} className="w-full">
              {createRuleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create Rule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Alerts Tab ──

function AlertsTab({ onClientSelect }: { onClientSelect?: (clientId: string) => void }) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const updateAlert = useUpdateAlert();

  const { data, isLoading } = useAlerts({
    page,
    limit: 20,
    status: statusFilter || undefined,
    severity: severityFilter || undefined,
  });

  const alerts = (data?.alerts ?? []) as Array<Record<string, unknown>>;
  const pagination = data?.pagination;

  // Alert Summary Stats
  const alertStats = useMemo(() => {
    const total = alerts.length;
    const open = alerts.filter((a) => (a.status as string) === 'open').length;
    const escalated = alerts.filter((a) => (a.status as string) === 'escalated').length;
    const now = new Date();
    const closedThisMonth = alerts.filter((a) => {
      if ((a.status as string) !== 'closed') return false;
      const closedAt = a.updatedAt ? new Date(a.updatedAt as string) : a.createdAt ? new Date(a.createdAt as string) : null;
      return closedAt && closedAt.getMonth() === now.getMonth() && closedAt.getFullYear() === now.getFullYear();
    }).length;
    return { total, open, escalated, closedThisMonth };
  }, [alerts]);

  const handleAction = async (alertId: string, action: string, actionData?: Record<string, unknown>) => {
    try {
      await updateAlert.mutateAsync({ id: alertId, data: { action, ...actionData } });
      toast.success(`Alert ${action}`);
    } catch {
      toast.error(`Failed to ${action} alert`);
    }
  };

  // Batch actions
  const toggleAlertSelection = (alertId: string) => {
    setSelectedAlerts((prev) => {
      const next = new Set(prev);
      if (next.has(alertId)) next.delete(alertId);
      else next.add(alertId);
      return next;
    });
  };

  const toggleAllAlerts = () => {
    if (selectedAlerts.size === alerts.length) {
      setSelectedAlerts(new Set());
    } else {
      setSelectedAlerts(new Set(alerts.map((a) => a.id as string)));
    }
  };

  const handleBatchEscalate = async () => {
    let successCount = 0;
    for (const id of selectedAlerts) {
      try {
        await updateAlert.mutateAsync({ id, data: { action: 'escalate' } });
        successCount++;
      } catch { /* continue */ }
    }
    toast.success(`Escalated ${successCount} alerts`);
    setSelectedAlerts(new Set());
  };

  const handleBatchClose = async () => {
    let successCount = 0;
    for (const id of selectedAlerts) {
      try {
        await updateAlert.mutateAsync({ id, data: { action: 'close' } });
        successCount++;
      } catch { /* continue */ }
    }
    toast.success(`Closed ${successCount} alerts`);
    setSelectedAlerts(new Set());
  };

  const handleBatchAssign = async () => {
    const assignee = 'Current User';
    let successCount = 0;
    for (const id of selectedAlerts) {
      try {
        await updateAlert.mutateAsync({ id, data: { action: 'assign', assignedTo: assignee } });
        successCount++;
      } catch { /* continue */ }
    }
    toast.success(`Assigned ${successCount} alerts to ${assignee}`);
    setSelectedAlerts(new Set());
  };

  // ── CSV Export ──
  const exportCSV = () => {
    if (alerts.length === 0) {
      toast.error('No alerts to export');
      return;
    }

    const headers = [
      'Alert ID',
      'Alert Type',
      'Client Name',
      'Description',
      'Base Severity',
      'Final Severity',
      'Status',
      'Assigned To',
      'Created At',
    ];

    const rows = alerts.map((alert) => {
      const client = alert.client as Record<string, unknown> | undefined;
      return [
        (alert.alertId as string) ?? '',
        (alert.alertType as string) ?? '',
        (client?.fullName as string) ?? '',
        (alert.description as string) ?? '',
        (alert.baseSeverity as string) ?? '',
        (alert.finalSeverity as string) ?? '',
        (alert.status as string) ?? '',
        (alert.assignedTo as string) ?? 'Unassigned',
        alert.createdAt ? new Date(alert.createdAt as string).toLocaleString('en-AU') : '',
      ];
    });

    downloadCSV(
      `alerts-export-${new Date().toISOString().split('T')[0]}.csv`,
      headers,
      rows,
    );
    toast.success(`Exported ${alerts.length} alerts to CSV`);
  };

  return (
    <div className="space-y-4">
      {/* Risk Score Distribution Histogram */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            Risk Score Distribution
          </h3>
          <Badge variant="outline" className="text-[10px]">{alerts.length} alerts</Badge>
        </div>
        <div className="space-y-0.5">
          {(() => {
            // Compute risk score distribution
            const buckets = [
              { label: '0-20%', min: 0, max: 0.2, color: '#10b981' },
              { label: '21-40%', min: 0.2, max: 0.4, color: '#22c55e' },
              { label: '41-60%', min: 0.4, max: 0.6, color: '#f59e0b' },
              { label: '61-80%', min: 0.6, max: 0.8, color: '#f97316' },
              { label: '81-100%', min: 0.8, max: 1.01, color: '#ef4444' },
            ];
            const counts = buckets.map(b => ({
              ...b,
              count: alerts.filter((a) => {
                const score = (a.riskScore as number) ?? (a.baseSeverity === 'critical' ? 0.9 : a.baseSeverity === 'high' ? 0.7 : a.baseSeverity === 'medium' ? 0.5 : 0.2);
                return score >= b.min && score < b.max;
              }).length,
            }));
            const maxCount = Math.max(...counts.map(c => c.count), 1);

            return counts.map((bucket) => (
              <div key={bucket.label} className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground w-14 text-right">{bucket.label}</span>
                <div className="flex-1 h-5 rounded bg-muted/20 overflow-hidden relative">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(bucket.count / maxCount) * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded"
                    style={{ backgroundColor: bucket.color, opacity: 0.75 }}
                  />
                  {bucket.count > 0 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
                      {bucket.count}
                    </span>
                  )}
                </div>
              </div>
            ));
          })()}
        </div>
      </Card>

      {/* Alert Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-800">
              <Bell className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{alertStats.total}</div>
              <div className="text-[10px] text-muted-foreground">Total Alerts</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-950/30">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{alertStats.open}</div>
              <div className="text-[10px] text-muted-foreground">Open Alerts</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-orange-100 dark:bg-orange-950/30">
              <ChevronUp className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{alertStats.escalated}</div>
              <div className="text-[10px] text-muted-foreground">Escalated Alerts</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-950/30">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{alertStats.closedThisMonth}</div>
              <div className="text-[10px] text-muted-foreground">Closed This Month</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters + Export */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="reported">Reported</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Severities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={alerts.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Select All Checkbox */}
      {alerts.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            checked={selectedAlerts.size === alerts.length && alerts.length > 0}
            onCheckedChange={toggleAllAlerts}
          />
          <span className="text-xs text-muted-foreground">
            {selectedAlerts.size > 0 ? `${selectedAlerts.size} selected` : 'Select all'}
          </span>
        </div>
      )}

      {/* Alert Cards */}
      {isLoading ? (
        <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
      ) : alerts.length === 0 ? (
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-center gap-3">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
              <ShieldAlert className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground">No Alerts Found</h4>
              <p className="text-xs text-muted-foreground/70 mt-1">Alerts will appear here when monitoring rules are triggered.</p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {alerts.map((alert: Record<string, unknown>, alertIndex: number) => {
              const alertId = alert.id as string;
              const isExpanded = expandedAlert === alertId;
              const isSelected = selectedAlerts.has(alertId);
              const client = alert.client as Record<string, unknown> | undefined;
              const baseSeverity = alert.baseSeverity as string;
              const finalSeverity = alert.finalSeverity as string;
              const severityEscalated = baseSeverity !== finalSeverity;
              const docRiskScore = (alert.documentRiskScore as number) ?? 0;
              const styles = SEVERITY_STYLES[finalSeverity] ?? SEVERITY_STYLES.medium;

              // Colored severity badge mapping
              const severityBadgeStyles: Record<string, string> = {
                low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
                medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
                critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
              };

              return (
                <motion.div
                  key={alertId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, delay: alertIndex * 0.04 }}
                  layout
                >
                  <Card
                    className={`overflow-hidden border-l-4 ${styles.border} ${styles.bg} ${isSelected ? 'ring-2 ring-primary/30' : ''} transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <div className="pt-0.5">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleAlertSelection(alertId)}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => setExpandedAlert(isExpanded ? null : alertId)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{(alert.alertId as string)?.slice(-12)}</span>
                                <Badge className={`text-[10px] font-semibold ${severityBadgeStyles[finalSeverity] ?? severityBadgeStyles.medium}`}>
                                  {finalSeverity.charAt(0).toUpperCase() + finalSeverity.slice(1)}
                                </Badge>
                                <AnimatePresence>
                                  {severityEscalated && (
                                    <motion.div
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      exit={{ opacity: 0, x: -10 }}
                                      transition={{ duration: 0.3 }}
                                    >
                                      <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px]">
                                        ↑ Escalated from {baseSeverity}
                                      </Badge>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                                <StatusBadge status={(alert.status as string) ?? 'open'} />
                                <Badge variant="outline" className="text-[10px]">{(alert.alertType as string)?.replace(/_/g, ' ')}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{alert.description as string}</p>
                              <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1.5">
                                <span
                                  className={client ? 'cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors' : ''}
                                  onClick={() => {
                                    if (client?.id) onClientSelect?.(client.id as string);
                                  }}
                                >
                                  Client: {client?.fullName as string}
                                </span>
                                <span>Assigned: {(alert.assignedTo as string) ?? 'Unassigned'}</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatTimeAgo(alert.createdAt as string)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Risk Score Breakdown Bar */}
                          <div className="mt-3 space-y-1.5">
                            {/* Main risk meter */}
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-24">Risk Level</span>
                              <div className="flex-1 h-2.5 bg-muted/50 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.max(((alert.riskScore as number) ?? docRiskScore ?? 0) * 100, 2)}%` }}
                                  transition={{ duration: 0.8, ease: 'easeOut' }}
                                  style={{ backgroundColor: finalSeverity === 'critical' ? '#dc2626' : finalSeverity === 'high' ? '#ef4444' : finalSeverity === 'medium' ? '#f59e0b' : '#10b981' }}
                                />
                              </div>
                              <span className="text-[10px] font-bold tabular-nums shrink-0">
                                {(((alert.riskScore as number) ?? docRiskScore ?? 0) * 100).toFixed(0)}%
                              </span>
                            </div>
                            {/* Document risk sub-bar */}
                            {docRiskScore > 0 && (
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-24">Doc Risk Impact</span>
                                <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                                  <motion.div
                                    className={`h-full rounded-full ${styles.barColor}`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${docRiskScore * 100}%` }}
                                    transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground shrink-0">{(docRiskScore * 100).toFixed(0)}%</span>
                              </div>
                            )}
                          </div>

                          {/* Severity Escalation Visualization */}
                          {severityEscalated && docRiskScore > 0 && (
                            <div className="mt-2 flex items-center gap-2 text-[10px]">
                              <RiskBadge level={baseSeverity} />
                              <span className="text-muted-foreground">→</span>
                              <RiskBadge level={finalSeverity} />
                              <span className="text-muted-foreground ml-2">
                                Document risk boosted severity by {(docRiskScore * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeInOut' }}
                                className="overflow-hidden"
                              >
                                <div className="mt-3 pt-3 border-t">
                                  {/* Related Transactions */}
                                  {alert.relatedTransactions && (
                                    <div className="mb-3">
                                      <h5 className="text-xs font-semibold text-muted-foreground mb-1">Related Transactions</h5>
                                      <pre className="text-[10px] bg-muted/30 rounded p-2 max-h-24 overflow-auto">
                                        {alert.relatedTransactions as string}
                                      </pre>
                                    </div>
                                  )}

                                  {/* Actions */}
                                  <div className="flex gap-2 flex-wrap">
                                    {(alert.status as string) === 'open' && (
                                      <Button size="sm" variant="outline" onClick={() => handleAction(alertId, 'investigate')}>
                                        Investigate
                                      </Button>
                                    )}
                                    {(alert.status as string) === 'investigating' && (
                                      <>
                                        <Button size="sm" variant="outline" onClick={() => handleAction(alertId, 'escalate')}>
                                          Escalate
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => handleAction(alertId, 'close')}>
                                          Close
                                        </Button>
                                      </>
                                    )}
                                    {(alert.status as string) === 'escalated' && (
                                      <Button size="sm" variant="outline" onClick={() => handleAction(alertId, 'report')}>
                                        Report
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing {alerts.length} of {pagination.total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Batch Action Bar */}
      <AnimatePresence>
        {selectedAlerts.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-3 bg-background border shadow-lg rounded-xl px-5 py-3">
              <span className="text-sm font-medium">
                {selectedAlerts.size} alert{selectedAlerts.size > 1 ? 's' : ''} selected
              </span>
              <Separator orientation="vertical" className="h-6" />
              <Button size="sm" variant="outline" onClick={handleBatchEscalate} disabled={updateAlert.isPending}>
                <ChevronUp className="h-3.5 w-3.5 mr-1.5" />
                Escalate All
              </Button>
              <Button size="sm" variant="outline" onClick={handleBatchClose} disabled={updateAlert.isPending}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Close All
              </Button>
              <Button size="sm" variant="outline" onClick={handleBatchAssign} disabled={updateAlert.isPending}>
                <User className="h-3.5 w-3.5 mr-1.5" />
                Assign To
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedAlerts(new Set())}
                className="ml-1"
              >
                Clear
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
