'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useDashboardStats, useClients, useAlerts, useTransactions } from '@/hooks/useApi';
import { KPICard } from '@/components/shared/KPICard';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ChartTooltip } from '@/components/shared/ChartTooltip';
import {
  LayoutDashboard, Users, AlertTriangle, AlertOctagon, FileText, BarChart3,
  Plus, Upload, FileCheck, Eye, Calendar, ShieldCheck, Clock, ChevronRight,
  TrendingUp, CheckCircle2, XCircle, Scale, UserCheck, Shield, Activity,
  DollarSign, Flag, Database, Server, FileSpreadsheet, FolderOpen, Cpu,
  ArrowUpRight, Zap, RefreshCw, Sparkles, ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const RISK_COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

const RISK_NUMERIC: Record<string, number> = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 100,
};

const ACTIVITY_DOT_COLORS: Record<string, string> = {
  CLIENT_CREATED: 'bg-emerald-500',
  CLIENT_UPDATED: 'bg-amber-500',
  ALERT_GENERATED: 'bg-red-500',
  ALERT_ESCALATED: 'bg-red-500',
  ALERT_CLOSED: 'bg-red-400',
  REPORT_GENERATED: 'bg-blue-500',
  REPORT_APPROVED: 'bg-blue-400',
  REPORT_SUBMITTED: 'bg-blue-500',
  DOCUMENT_ANALYZED: 'bg-emerald-500',
  USER_LOGIN: 'bg-slate-400',
};

function getActivityDotColor(action: string): string {
  if (ACTIVITY_DOT_COLORS[action]) return ACTIVITY_DOT_COLORS[action];
  if (action.includes('CREATE') || action.includes('CREATED')) return 'bg-emerald-500';
  if (action.includes('UPDATE') || action.includes('UPDATED')) return 'bg-amber-500';
  if (action.includes('ALERT')) return 'bg-red-500';
  if (action.includes('REPORT')) return 'bg-blue-500';
  return 'bg-slate-400';
}

type Section = 'dashboard' | 'documents' | 'onboarding' | 'ubo' | 'transactions' | 'reporting' | 'governance' | 'settings';

interface DashboardSectionProps {
  onNavigate?: (section: Section) => void;
  onClientSelect?: (clientId: string) => void;
}

const TIME_RANGES = [
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
];

// Risk heatmap configuration
const RISK_CATEGORIES = [
  { key: 'sanctions_match', label: 'Sanctions' },
  { key: 'pep_match', label: 'PEP' },
  { key: 'structuring', label: 'Structuring' },
  { key: 'smr_threshold', label: 'Threshold' },
  { key: 'unusual_activity', label: 'Unusual Activity' },
] as const;

const CLIENT_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

const RISK_LEVEL_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

// Heatmap cell color based on count
function getHeatmapCellStyle(count: number, maxCount: number): { backgroundColor: string; textColor: string } {
  if (count === 0) return { backgroundColor: '#dcfce7', textColor: '#166534' };
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio <= 0.25) return { backgroundColor: '#bbf7d0', textColor: '#166534' };
  if (ratio <= 0.5) return { backgroundColor: '#fef08a', textColor: '#854d0e' };
  if (ratio <= 0.75) return { backgroundColor: '#fed7aa', textColor: '#9a3412' };
  return { backgroundColor: '#fecaca', textColor: '#991b1b' };
}

// Compliance calendar helpers
interface ComplianceEvent {
  id: string;
  title: string;
  date: Date;
  category: 'Regulatory' | 'Internal' | 'Operational';
  categoryColor: string;
}

function getNextBusinessDay(date: Date): Date {
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function getLastBusinessDayOfMonth(year: number, month: number): Date {
  const d = new Date(year, month + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function getNextDayOfWeek(fromDate: Date, dayOfWeek: number): Date {
  const d = new Date(fromDate);
  const currentDay = d.getDay();
  const diff = (dayOfWeek - currentDay + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
  return d;
}

function getEndOfNextQuarter(fromDate: Date): Date {
  const month = fromDate.getMonth();
  let quarterEndMonth: number;
  let year = fromDate.getFullYear();
  if (month < 3) quarterEndMonth = 2;
  else if (month < 6) quarterEndMonth = 5;
  else if (month < 9) quarterEndMonth = 8;
  else quarterEndMonth = 11;

  const quarterEnd = new Date(year, quarterEndMonth + 1, 0);
  if (quarterEnd <= fromDate) {
    quarterEndMonth += 3;
    if (quarterEndMonth > 11) {
      quarterEndMonth -= 12;
      year += 1;
    }
    return new Date(year, quarterEndMonth + 1, 0);
  }
  return quarterEnd;
}

function generateComplianceEvents(): ComplianceEvent[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  return [
    {
      id: 'smr-filing',
      title: 'SMR Filing Deadline',
      date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3),
      category: 'Regulatory',
      categoryColor: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
    },
    {
      id: 'ttr-monthly',
      title: 'TTR Monthly Report',
      date: getLastBusinessDayOfMonth(currentYear, currentMonth),
      category: 'Regulatory',
      categoryColor: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
    },
    {
      id: 'ifti-quarterly',
      title: 'IFTI-E Quarterly Report',
      date: getEndOfNextQuarter(now),
      category: 'Regulatory',
      categoryColor: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
    },
    {
      id: 'annual-review',
      title: 'Annual AML/CTF Program Review',
      date: new Date(currentYear, 11, 31),
      category: 'Internal',
      categoryColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    },
    {
      id: 'compliance-meeting',
      title: 'Compliance Committee Meeting',
      date: getNextDayOfWeek(now, 5),
      category: 'Internal',
      categoryColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    },
    {
      id: 'sanctions-check',
      title: 'Sanctions List Update Check',
      date: getNextDayOfWeek(now, 1),
      category: 'Operational',
      categoryColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    },
    {
      id: 'risk-review',
      title: 'Risk Assessment Review',
      date: getEndOfNextQuarter(now),
      category: 'Operational',
      categoryColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    },
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function getDaysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyColor(daysUntil: number): string {
  if (daysUntil < 0) return 'bg-red-500';
  if (daysUntil <= 7) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getUrgencyLabel(daysUntil: number): string {
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d overdue`;
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `${daysUntil}d`;
}

/** Generate relative time string */
function getRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// Regulatory compliance status configuration
interface RegulationStatus {
  id: string;
  name: string;
  shortName: string;
  status: 'compliant' | 'review' | 'non-compliant';
  lastChecked: string;
  icon: React.ElementType;
}

const REGULATION_STATUSES: RegulationStatus[] = [
  {
    id: 'aml-ctf',
    name: 'AML/CTF Act 2006',
    shortName: 'AML/CTF',
    status: 'compliant',
    lastChecked: new Date(Date.now() - 2 * 86400000).toISOString(),
    icon: Scale,
  },
  {
    id: 'privacy',
    name: 'Privacy Act 1988',
    shortName: 'Privacy',
    status: 'compliant',
    lastChecked: new Date(Date.now() - 5 * 86400000).toISOString(),
    icon: Shield,
  },
  {
    id: 'austrac',
    name: 'AUSTRAC Registration',
    shortName: 'AUSTRAC',
    status: 'review',
    lastChecked: new Date(Date.now() - 12 * 86400000).toISOString(),
    icon: ShieldCheck,
  },
  {
    id: 'kyc-aml',
    name: 'KYC/AML Program',
    shortName: 'KYC/AML',
    status: 'compliant',
    lastChecked: new Date(Date.now() - 1 * 86400000).toISOString(),
    icon: UserCheck,
  },
  {
    id: 'sanctions',
    name: 'Sanctions Screening',
    shortName: 'Sanctions',
    status: 'compliant',
    lastChecked: new Date(Date.now() - 0.5 * 86400000).toISOString(),
    icon: ShieldCheck,
  },
];

function getRegStatusConfig(status: RegulationStatus['status']) {
  switch (status) {
    case 'compliant':
      return {
        dotColor: 'bg-emerald-500',
        bgColor: 'bg-emerald-50 dark:bg-emerald-950/20',
        borderColor: 'border-emerald-200 dark:border-emerald-800/50',
        textColor: 'text-emerald-700 dark:text-emerald-400',
        icon: CheckCircle2,
        label: 'Compliant',
      };
    case 'review':
      return {
        dotColor: 'bg-amber-500',
        bgColor: 'bg-amber-50 dark:bg-amber-950/20',
        borderColor: 'border-amber-200 dark:border-amber-800/50',
        textColor: 'text-amber-700 dark:text-amber-400',
        icon: Clock,
        label: 'Review Needed',
      };
    case 'non-compliant':
      return {
        dotColor: 'bg-red-500',
        bgColor: 'bg-red-50 dark:bg-red-950/20',
        borderColor: 'border-red-200 dark:border-red-800/50',
        textColor: 'text-red-700 dark:text-red-400',
        icon: XCircle,
        label: 'Non-Compliant',
      };
  }
}

// Chart card with gradient border hover effect
function ChartCardWrapper({
  children,
  gradientFrom,
  gradientTo,
  className,
}: {
  children: React.ReactNode;
  gradientFrom: string;
  gradientTo: string;
  className?: string;
}) {
  return (
    <div className={`group relative ${className ?? ''}`}>
      {/* Gradient border on hover */}
      <div
        className="absolute -inset-[1px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-0"
        style={{
          background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
        }}
      />
      {/* Glow effect on hover */}
      <div
        className="absolute -inset-2 rounded-2xl opacity-0 group-hover:opacity-40 transition-opacity duration-500 pointer-events-none z-[-1] blur-md"
        style={{
          background: `linear-gradient(135deg, ${gradientFrom}40, ${gradientTo}40)`,
        }}
      />
      {/* Content card with transparent border that reveals gradient underneath */}
      <div className="relative z-10 rounded-xl bg-card border border-transparent group-hover:border-transparent">
        {children}
      </div>
    </div>
  );
}

/** Get greeting based on current time of day */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardSection({ onNavigate, onClientSelect }: DashboardSectionProps) {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: clientsData } = useClients({ limit: 1000 });
  const { data: alertsData } = useAlerts({ limit: 100 });
  const { data: txData } = useTransactions({ limit: 100 });
  const [timeRange, setTimeRange] = useState('30');

  // Auto-refresh data freshness indicator
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshed.getTime()) / 1000));
    }, 1000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [lastRefreshed]);

  // Memoize compliance events
  const complianceEvents = useMemo(() => generateComplianceEvents(), []);

  // Build client risk lookup map (before early return for hooks rule)
  const clients = clientsData?.clients ?? [];
  const clientRiskMap = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c: Record<string, unknown>) => {
      map.set(c.id as string, (c.riskRating as string) ?? 'low');
    });
    return map;
  }, [clients]);

  // Build heatmap matrix (before early return for hooks rule)
  const alerts = alertsData?.alerts ?? [];
  const heatmapData = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    RISK_CATEGORIES.forEach(cat => {
      matrix[cat.key] = { low: 0, medium: 0, high: 0, critical: 0 };
    });

    alerts.forEach((a: Record<string, unknown>) => {
      const alertType = a.alertType as string;
      const clientId = a.clientId as string;
      if (matrix[alertType]) {
        const clientRisk = clientRiskMap.get(clientId) ?? 'low';
        if (matrix[alertType][clientRisk] !== undefined) {
          matrix[alertType][clientRisk] += 1;
        }
      }
    });

    let maxCount = 0;
    RISK_CATEGORIES.forEach(cat => {
      CLIENT_RISK_LEVELS.forEach(level => {
        if (matrix[cat.key][level] > maxCount) {
          maxCount = matrix[cat.key][level];
        }
      });
    });

    return { matrix, maxCount };
  }, [alerts, clientRiskMap]);

  // Risk score trend by date (before early return for hooks rule)
  const riskTrendData = useMemo(() => {
    const dateMap = new Map<string, { total: number; count: number }>();
    alerts.forEach((a: Record<string, unknown>) => {
      const date = new Date(a.createdAt as string).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
      const clientId = a.clientId as string;
      const riskRating = clientRiskMap.get(clientId) ?? 'low';
      const numeric = RISK_NUMERIC[riskRating] ?? 25;
      const existing = dateMap.get(date) ?? { total: 0, count: 0 };
      existing.total += numeric;
      existing.count += 1;
      dateMap.set(date, existing);
    });
    return [...dateMap.entries()]
      .map(([date, { total, count }]) => ({
        date,
        avgRisk: count > 0 ? Math.round((total / count) * 10) / 10 : 0,
      }))
      .slice(-14);
  }, [alerts, clientRiskMap]);

  // Client activity feed (before early return for hooks rule)
  const clientActivityFeed = useMemo(() => {
    const clientActions = ['CLIENT_CREATED', 'CLIENT_UPDATED', 'RISK_CHANGED', 'RATING_CHANGED'];
    return (stats?.recentActivity ?? [])
      .filter(a => {
        const action = a.action.toUpperCase();
        return clientActions.some(ca => action.includes(ca.replace('_', ' '))) ||
          a.entityType?.toLowerCase() === 'client';
      })
      .slice(0, 5);
  }, [stats?.recentActivity]);

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Dashboard" description="Platform overview and key metrics" icon={LayoutDashboard} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-2/3 mb-2" />
              <div className="h-8 bg-muted rounded w-1/2" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const { metrics, recentActivity } = stats;
  const timeRangeLabel = TIME_RANGES.find(t => t.value === timeRange)?.label ?? 'Last 30 Days';

  // Prepare risk distribution data
  const riskDistribution = [
    { name: 'Low', value: clients.filter((c: Record<string, unknown>) => c.riskRating === 'low').length, color: RISK_COLORS.low },
    { name: 'Medium', value: clients.filter((c: Record<string, unknown>) => c.riskRating === 'medium').length, color: RISK_COLORS.medium },
    { name: 'High', value: clients.filter((c: Record<string, unknown>) => c.riskRating === 'high').length, color: RISK_COLORS.high },
    { name: 'Critical', value: clients.filter((c: Record<string, unknown>) => c.riskRating === 'critical').length, color: RISK_COLORS.critical },
  ].filter(d => d.value > 0);

  // Prepare alerts over time data
  const alertsByDate = new Map<string, number>();
  alerts.forEach((a: Record<string, unknown>) => {
    const date = new Date(a.createdAt as string).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
    alertsByDate.set(date, (alertsByDate.get(date) ?? 0) + 1);
  });
  const alertsOverTime = [...alertsByDate.entries()]
    .map(([date, count]) => ({ date, alerts: count }))
    .slice(-14);

  // Prepare transaction volume data
  const transactions = txData?.transactions ?? [];
  const txByDate = new Map<string, { count: number; volume: number }>();
  transactions.forEach((t: Record<string, unknown>) => {
    const date = new Date(t.transactionDate as string).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
    const existing = txByDate.get(date) ?? { count: 0, volume: 0 };
    existing.count += 1;
    existing.volume += (t.amount as number) ?? 0;
    txByDate.set(date, existing);
  });
  const txVolume = [...txByDate.entries()]
    .map(([date, data]) => ({ date, volume: Math.round(data.volume), count: data.count }))
    .slice(-14);

  const formatCurrency = (val: number) => `$${(val / 1000).toFixed(0)}k`;

  // Calculate Compliance Health Score
  const totalClients = metrics.totalClients || 1;
  const complianceScore = Math.max(0, Math.min(100,
    100 - (metrics.highRiskClients / totalClients * 50) - (metrics.criticalAlerts / totalClients * 30) - (metrics.avgRiskScore * 20)
  ));
  const scoreLabel = complianceScore > 80 ? 'Excellent' : complianceScore > 60 ? 'Good' : 'Needs Attention';
  const scoreStroke = complianceScore > 80 ? '#10b981' : complianceScore > 60 ? '#f59e0b' : '#ef4444';

  // SVG gauge calculation
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (complianceScore / 100) * circumference;

  // Summary stats bar data
  const totalVolume = transactions.reduce((sum: number, t: Record<string, unknown>) => sum + ((t.amount as number) ?? 0), 0);
  const avgTransaction = transactions.length > 0 ? totalVolume / transactions.length : 0;
  const flaggedCount = transactions.filter((t: Record<string, unknown>) => t.flagged === true).length;
  const flaggedPct = transactions.length > 0 ? (flaggedCount / transactions.length * 100) : 0;
  const highRiskPct = totalClients > 0 ? (metrics.highRiskClients / (metrics.totalClients || 1) * 100) : 0;

  // Sparkline data for KPI cards (7-point mock trend data based on metrics)
  const sparklineDataMap: Record<string, number[]> = {
    'Total Clients': [12, 15, 18, 14, 22, 19, metrics.totalClients],
    'High Risk': [3, 5, 4, 6, 5, 7, metrics.highRiskClients],
    'Open Alerts': [8, 12, 10, 15, 11, 14, metrics.openAlerts],
    'Critical Alerts': [2, 3, 1, 2, 4, 3, metrics.criticalAlerts],
    'Reports Filed': [5, 8, 6, 10, 9, 12, metrics.reportsFiled.smr + metrics.reportsFiled.ttr + metrics.reportsFiled.iftiE],
    'Avg Risk Score': [45, 42, 48, 40, 38, 35, Math.round(metrics.avgRiskScore * 100)],
  };

  // Custom tooltip for bar chart
  const alertsTooltip = (props: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; dataKey: string; payload?: Record<string, unknown> }>; label?: string }) => (
    <ChartTooltip
      active={props.active}
      payload={props.payload}
      label={props.label}
      valueFormatter={(value) => `${value} alerts`}
    />
  );

  // Custom tooltip for area chart
  const volumeTooltip = (props: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; dataKey: string; payload?: Record<string, unknown> }>; label?: string }) => (
    <ChartTooltip
      active={props.active}
      payload={props.payload}
      label={props.label}
      valueFormatter={(value) => `$${value.toLocaleString()}`}
    />
  );

  // Custom tooltip for risk trend line chart
  const riskTrendTooltip = (props: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; dataKey: string; payload?: Record<string, unknown> }>; label?: string }) => (
    <ChartTooltip
      active={props.active}
      payload={props.payload}
      label={props.label}
      valueFormatter={(value) => `${value} avg risk`}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <SectionHeader title="Dashboard" description="Platform overview and key metrics" icon={LayoutDashboard} />
            <Badge className="text-[9px] font-semibold flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <RefreshCw className={`h-3 w-3 ${secondsAgo < 5 ? 'animate-spin' : ''}`} />
              Updated {secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="text-[9px] font-medium flex items-center gap-1 px-2 py-0.5 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20">
            <ShieldCheck className="h-3 w-3" />
            AUSTRAC Reporting Period
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => { setLastRefreshed(new Date()); setSecondsAgo(0); }}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[150px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map(tr => (
                  <SelectItem key={tr.value} value={tr.value}>{tr.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Compliance Insights Card */}
      <Card className="border-border/60 shadow-sm overflow-hidden relative bg-gradient-to-r from-emerald-50/60 via-teal-50/40 to-emerald-50/60 dark:from-emerald-950/20 dark:via-teal-950/15 dark:to-emerald-950/20">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400 opacity-60" />
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/30">
                <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">{getGreeting()}, Compliance Team</h3>
                <p className="text-xs text-muted-foreground">Here&apos;s your compliance overview at a glance</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              Last refreshed: {lastRefreshed.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="outline" className="text-[10px] font-semibold px-3 py-1 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 bg-red-50/60 dark:bg-red-950/20">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {metrics.highRiskClients} High-Risk Clients Require Review
            </Badge>
            <Badge variant="outline" className="text-[10px] font-semibold px-3 py-1 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20">
              <FileText className="h-3 w-3 mr-1" />
              {metrics.reportsFiled.smr + metrics.reportsFiled.ttr + metrics.reportsFiled.iftiE} Reports Pending Approval
            </Badge>
            <Badge variant="outline" className="text-[10px] font-semibold px-3 py-1 border-orange-200 dark:border-orange-800/50 text-orange-700 dark:text-orange-400 bg-orange-50/60 dark:bg-orange-950/20">
              <AlertOctagon className="h-3 w-3 mr-1" />
              {metrics.openAlerts} Alerts Need Attention
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Bar - Compact horizontal pills */}
      <Card className="p-2.5 sm:p-3.5 border-border/60 shadow-sm overflow-hidden relative">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-50/40 via-amber-50/30 to-red-50/30 dark:from-emerald-950/10 dark:via-amber-950/10 dark:to-red-950/10 pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400/50 via-amber-400/50 to-red-400/50 animate-pulse" />
        {/* Animated gradient border at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-400 via-amber-400 to-red-400 opacity-40 animate-pulse" />
        <div className="relative flex gap-2.5 sm:gap-3.5 overflow-x-auto pb-1 scrollbar-thin">
        {[
          { label: 'Active Clients', value: metrics.totalClients, icon: Users, bg: 'bg-sky-50 dark:bg-sky-950/30', text: 'text-sky-700 dark:text-sky-400', iconColor: 'text-sky-500', borderBottom: 'border-b-2 border-b-sky-400' },
          { label: 'Open Alerts', value: metrics.openAlerts, icon: AlertTriangle, bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400', iconColor: 'text-red-500', borderBottom: 'border-b-2 border-b-red-400' },
          { label: 'Pending Reports', value: metrics.reportsFiled.smr + metrics.reportsFiled.ttr + metrics.reportsFiled.iftiE, icon: FileText, bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', iconColor: 'text-amber-500', borderBottom: 'border-b-2 border-b-amber-400' },
          { label: 'Documents Today', value: metrics.documentsAnalyzed, icon: FileSpreadsheet, bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', iconColor: 'text-emerald-500', borderBottom: 'border-b-2 border-b-emerald-400' },
          { label: 'Cases Open', value: metrics.criticalAlerts, icon: FolderOpen, bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-400', iconColor: 'text-orange-500', borderBottom: 'border-b-2 border-b-orange-400' },
          { label: 'System Uptime', value: '99.9%', icon: Cpu, bg: 'bg-slate-50 dark:bg-slate-800/50', text: 'text-slate-700 dark:text-slate-300', iconColor: 'text-slate-500', borderBottom: 'border-b-2 border-b-slate-400' },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.97 }}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full ${stat.bg} ${stat.borderBottom} border border-border/50 shrink-0 transition-all duration-200 hover:shadow-lg cursor-default group`}
          >
            <stat.icon className={`h-4 w-4 ${stat.iconColor} transition-transform duration-200 group-hover:scale-110`} />
            <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground whitespace-nowrap">{stat.label}</span>
            <motion.span
              key={String(stat.value)}
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={`text-xs sm:text-sm font-bold ${stat.text}`}
            >
              {stat.value}
            </motion.span>
          </motion.div>
        ))}
        </div>
      </Card>

      {/* KPI Cards - Enhanced with sparkline data and background patterns */}
      <div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-lg" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '8px 8px' }} />
            <KPICard title="Total Clients" value={metrics.totalClients} icon={Users} color="blue" trend={{ value: 8.2, direction: 'up' }} sparklineData={sparklineDataMap['Total Clients']} />
          </div>
          <div className="relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-lg" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '8px 8px' }} />
            <KPICard title="High Risk" value={metrics.highRiskClients} icon={AlertTriangle} color="amber" trend={{ value: 3.1, direction: 'up' }} sparklineData={sparklineDataMap['High Risk']} invertTrend />
          </div>
          <div className="relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-lg" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '8px 8px' }} />
            <KPICard title="Open Alerts" value={metrics.openAlerts} icon={AlertOctagon} color="red" trend={{ value: 5.4, direction: 'up' }} sparklineData={sparklineDataMap['Open Alerts']} invertTrend />
          </div>
          <div className="relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-lg" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '8px 8px' }} />
            <KPICard title="Critical Alerts" value={metrics.criticalAlerts} icon={AlertOctagon} color="red" trend={{ value: 2.0, direction: 'down' }} sparklineData={sparklineDataMap['Critical Alerts']} invertTrend />
          </div>
          <div className="relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-lg" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '8px 8px' }} />
            <KPICard title="Reports Filed" value={metrics.reportsFiled.smr + metrics.reportsFiled.ttr + metrics.reportsFiled.iftiE} icon={FileText} color="emerald" trend={{ value: 12.5, direction: 'up' }} sparklineData={sparklineDataMap['Reports Filed']} />
          </div>
          <div className="relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-lg" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '8px 8px' }} />
            <KPICard title="Avg Risk Score" value={`${(metrics.avgRiskScore * 100).toFixed(0)}%`} icon={BarChart3} color="slate" trend={{ value: 1.3, direction: 'down' }} sparklineData={sparklineDataMap['Avg Risk Score']} invertTrend />
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground text-right">{timeRangeLabel}</div>
      </div>

      {/* Enhanced Dashboard Summary Stats Bar */}
      <Card className="border-border/60 shadow-sm overflow-hidden relative">
        {/* Subtle gradient accent at top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 via-amber-400 to-red-400 opacity-50" />
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0">
            {[
              { icon: DollarSign, iconBg: 'bg-sky-50 dark:bg-sky-950/30', iconColor: 'text-sky-600 dark:text-sky-400', label: 'Total Volume', value: `$${(totalVolume / 1000000).toFixed(1)}M`, accent: 'from-sky-400 to-sky-200' },
              { icon: BarChart3, iconBg: 'bg-emerald-50 dark:bg-emerald-950/30', iconColor: 'text-emerald-600 dark:text-emerald-400', label: 'Avg Transaction', value: `$${avgTransaction.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`, accent: 'from-emerald-400 to-emerald-200' },
              { icon: Flag, iconBg: 'bg-amber-50 dark:bg-amber-950/30', iconColor: 'text-amber-600 dark:text-amber-400', label: 'Flagged', value: `${flaggedPct.toFixed(1)}%`, accent: 'from-amber-400 to-amber-200' },
              { icon: AlertTriangle, iconBg: 'bg-red-50 dark:bg-red-950/30', iconColor: 'text-red-600 dark:text-red-400', label: 'High Risk', value: `${highRiskPct.toFixed(1)}%`, accent: 'from-red-400 to-red-200' },
              { icon: CheckCircle2, iconBg: 'bg-emerald-50 dark:bg-emerald-950/30', iconColor: 'text-emerald-600 dark:text-emerald-400', label: 'Resolved', value: `${alerts.filter((a: Record<string, unknown>) => a.status === 'closed' || a.status === 'reported').length}`, accent: 'from-teal-400 to-teal-200' },
              { icon: Clock, iconBg: 'bg-sky-50 dark:bg-sky-950/30', iconColor: 'text-sky-600 dark:text-sky-400', label: 'Avg Response', value: '2.4h', accent: 'from-sky-400 to-sky-200' },
            ].map((stat, idx, arr) => (
              <div key={stat.label} className="flex-1 relative">
                {/* Gradient accent line between stats (vertical on desktop, not on last) */}
                {idx < arr.length - 1 && (
                  <div className="hidden sm:block absolute right-0 top-3 bottom-3 w-[2px]">
                    <div className={`h-full w-full bg-gradient-to-b ${stat.accent} opacity-20 rounded-full`} />
                  </div>
                )}
                <div className="flex items-center gap-3 px-5 py-3">
                  <div className={`p-2 rounded-lg ${stat.iconBg}`}>
                    <stat.icon className={`h-4 w-4 ${stat.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                    <p className="text-sm font-bold text-foreground">
                      {stat.value}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Data Quality Score Widget */}
      <Card className="shadow-sm hover:shadow-md transition-all duration-300 border-border/80 overflow-hidden relative gradient-border-card">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-teal-500/8 via-teal-500/3 to-transparent dark:from-teal-400/10 dark:via-teal-400/5 dark:to-transparent rounded-bl-3xl pointer-events-none" />
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Database className="h-4 w-4 text-teal-500" />
              Data Quality Score
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-normal flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last validated: 3h ago
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Circular Progress Indicator */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center">
              <div className="relative">
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
                  {(() => {
                    const dataQualityScore = 83;
                    const dqColor = dataQualityScore > 85 ? '#10b981' : dataQualityScore > 70 ? '#f59e0b' : '#ef4444';
                    const dqRadius = 48;
                    const dqCircumference = 2 * Math.PI * dqRadius;
                    const dqOffset = dqCircumference - (dataQualityScore / 100) * dqCircumference;
                    return (
                      <circle
                        cx="60" cy="60" r={dqRadius}
                        fill="none" stroke={dqColor} strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={dqCircumference}
                        strokeDashoffset={dqOffset}
                        transform="rotate(-90 60 60)"
                        className="transition-all duration-1000 ease-out metric-glow"
                        style={{ filter: `drop-shadow(0 0 6px ${dqColor}50)` }}
                      />
                    );
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-teal-600 dark:text-teal-400 metric-glow">83%</span>
                  <span className="text-[9px] text-muted-foreground font-medium">Complete</span>
                </div>
              </div>
            </div>

            {/* Sub-metrics Breakdown */}
            <div className="flex-1 space-y-3">
              {[
                { label: 'Client Data', value: 95, color: 'bg-emerald-500' },
                { label: 'Document Coverage', value: 78, color: 'bg-amber-500' },
                { label: 'Transaction Integrity', value: 92, color: 'bg-emerald-500' },
                { label: 'UBO Completeness', value: 65, color: 'bg-red-500' },
              ].map((metric) => (
                <div key={metric.label} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{metric.label}</span>
                    <span className={`text-xs font-bold ${
                      metric.value > 85 ? 'text-emerald-600 dark:text-emerald-400' :
                      metric.value > 70 ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>{metric.value}%</span>
                  </div>
                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${metric.value}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className={`h-full rounded-full ${metric.color} opacity-80`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compliance Health Score Card - Enhanced */}
      <Card className="shadow-sm hover:shadow-md transition-all duration-300 border-border/80 overflow-hidden relative">
        {/* Top-left corner gradient accent */}
        <div className="absolute top-0 left-0 w-24 h-24 bg-gradient-to-br from-primary/8 via-primary/3 to-transparent dark:from-primary/12 dark:via-primary/4 dark:to-transparent rounded-br-3xl pointer-events-none" />
        <CardContent className="p-0 relative">
          <div className="flex flex-col lg:flex-row">
            {/* Left: Score gauge */}
            <div className="flex-shrink-0 p-6 flex flex-col items-center justify-center bg-gradient-to-br from-muted/30 to-muted/10 lg:w-[220px]">
              <div className="relative mb-2">
                <svg width="130" height="130" viewBox="0 0 140 140" className="drop-shadow-lg">
                  <circle
                    cx="70" cy="70" r={radius}
                    fill="none" stroke="currentColor" strokeWidth="10"
                    className="text-muted/20"
                  />
                  <circle
                    cx="70" cy="70" r={radius}
                    fill="none" stroke={scoreStroke} strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    transform="rotate(-90 70 70)"
                    className="transition-all duration-1000 ease-out"
                    style={{ filter: `drop-shadow(0 0 8px ${scoreStroke}60)` }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black metric-glow tabular-nums" style={{ color: scoreStroke }}>
                    {Math.round(complianceScore)}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">/ 100</span>
                </div>
              </div>
              {/* Trend sparkline */}
              <div className="w-24 h-8 mb-2">
                <svg viewBox="0 0 100 32" className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="scoreTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={scoreStroke} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={scoreStroke} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {(() => {
                    const trendData = [72, 75, 78, 82, 85];
                    const min = Math.min(...trendData);
                    const max = Math.max(...trendData);
                    const range = max - min || 1;
                    const points = trendData.map((v, i) => {
                      const x = (i / (trendData.length - 1)) * 100;
                      const y = 32 - ((v - min) / range) * 24 - 4;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(' ');
                    return (
                      <>
                        <polygon points={`0,32 ${points} 100,32`} fill="url(#scoreTrendGrad)" />
                        <polyline points={points} fill="none" stroke={scoreStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="100" cy={32 - ((trendData[trendData.length - 1] - min) / range) * 24 - 4} r="3" fill={scoreStroke} stroke="white" strokeWidth="1" />
                      </>
                    );
                  })()}
                </svg>
              </div>
              <div className="text-center">
                <span
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: complianceScore > 80 ? '#dcfce7' : complianceScore > 60 ? '#fef3c7' : '#fee2e2',
                    color: complianceScore > 80 ? '#166534' : complianceScore > 60 ? '#92400e' : '#991b1b',
                  }}
                >
                  <ShieldCheck className="h-3 w-3" />
                  {scoreLabel}
                </span>
              </div>
            </div>

            {/* Right: Score breakdown */}
            <div className="flex-1 p-6">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="h-5 w-5 text-foreground" />
                <h3 className="text-base font-bold">Compliance Health Score</h3>
                <Badge variant="outline" className="text-[9px] ml-1 flex items-center gap-1">
                  <RefreshCw className="h-2.5 w-2.5" />
                  Auto-calculated
                </Badge>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">High Risk</span>
                  </div>
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-400">
                    {metrics.highRiskClients}
                  </div>
                  <div className="text-[10px] text-muted-foreground">clients</div>
                </div>
                <div className="p-3 rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertOctagon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Critical</span>
                  </div>
                  <div className="text-xl font-bold text-red-700 dark:text-red-400">
                    {metrics.criticalAlerts}
                  </div>
                  <div className="text-[10px] text-muted-foreground">alerts</div>
                </div>
                <div className="p-3 rounded-xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">SMR Filed</span>
                  </div>
                  <div className="text-xl font-bold text-sky-700 dark:text-sky-400">
                    {metrics.reportsFiled.smr}
                  </div>
                  <div className="text-[10px] text-muted-foreground">reports</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-700/40">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Avg Risk</span>
                  </div>
                  <div className="text-xl font-bold text-slate-700 dark:text-slate-300">
                    {(metrics.avgRiskScore * 100).toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">score <span className="text-emerald-600 dark:text-emerald-400">vs industry avg 35%</span></div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert Severity Breakdown Card */}
      <Card className="shadow-sm hover:shadow-md transition-all duration-300 border-border/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <AlertOctagon className="h-4 w-4 text-red-500" />
              Alert Severity Breakdown
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-normal">
              {alerts.length} total alerts
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(() => {
              const severityCounts = {
                critical: alerts.filter((a: Record<string, unknown>) => a.severity === 'critical' || a.riskRating === 'critical').length,
                high: alerts.filter((a: Record<string, unknown>) => a.severity === 'high' || a.riskRating === 'high').length,
                medium: alerts.filter((a: Record<string, unknown>) => a.severity === 'medium' || a.riskRating === 'medium').length,
                low: alerts.filter((a: Record<string, unknown>) => a.severity === 'low' || a.riskRating === 'low').length,
              };
              const maxCount = Math.max(severityCounts.critical, severityCounts.high, severityCounts.medium, severityCounts.low, 1);
              const severityItems = [
                { key: 'critical', label: 'Critical', count: severityCounts.critical, color: 'bg-red-500', textColor: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-950/30' },
                { key: 'high', label: 'High', count: severityCounts.high, color: 'bg-orange-500', textColor: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-950/30' },
                { key: 'medium', label: 'Medium', count: severityCounts.medium, color: 'bg-amber-500', textColor: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-950/30' },
                { key: 'low', label: 'Low', count: severityCounts.low, color: 'bg-emerald-500', textColor: 'text-emerald-700 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-950/30' },
              ];
              return severityItems.map((item) => (
                <div key={item.key} className="flex items-center gap-3">
                  <div className={`w-20 text-xs font-semibold ${item.textColor} text-right`}>
                    {item.label}
                  </div>
                  <div className="flex-1 h-7 rounded-lg bg-muted/30 overflow-hidden relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className={`h-full ${item.color} rounded-lg opacity-80`}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-foreground">
                      {item.count}
                    </span>
                  </div>
                </div>
              ));
            })()}
          </div>
          <div className="mt-3 pt-3 border-t flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Critical</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" /> High</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Medium</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Low</span>
          </div>
        </CardContent>
      </Card>

      {/* Regulatory Compliance Status - Full-width horizontal cards */}
      <Card className="shadow-sm hover:shadow-md transition-all duration-300 border-border/80 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-emerald-500" />
              Regulatory Compliance Status
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-normal flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                {REGULATION_STATUSES.filter(r => r.status === 'compliant').length}/{REGULATION_STATUSES.length} Compliant
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {REGULATION_STATUSES.map((reg, idx) => {
              const config = getRegStatusConfig(reg.status);
              const StatusIcon = config.icon;
              const RegIcon = reg.icon;
              const borderAccent = reg.status === 'compliant'
                ? 'border-t-emerald-400 dark:border-t-emerald-600'
                : reg.status === 'review'
                  ? 'border-t-amber-400 dark:border-t-amber-600'
                  : 'border-t-red-400 dark:border-t-red-600';

              return (
                <motion.div
                  key={reg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.06 }}
                  className={`relative p-4 rounded-xl border-2 border-t-4 ${config.borderColor} ${borderAccent} ${config.bgColor} transition-all duration-200 hover:shadow-lg hover:scale-[1.02] cursor-default`}
                >
                  {/* Pulse indicator for review status */}
                  {reg.status === 'review' && (
                    <div className="absolute top-2 right-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    <div className={`p-1.5 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
                      <RegIcon className={`h-4 w-4 ${config.textColor}`} />
                    </div>
                    <span className="text-xs font-bold truncate">{reg.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 mb-2">
                    <StatusIcon className={`h-3.5 w-3.5 ${config.textColor}`} />
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold px-2 py-0 h-5 ${config.bgColor} ${config.textColor} border-current/20`}
                    >
                      {config.label}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground mt-1">
                    <Clock className="h-3 w-3" />
                    <span>Checked {getRelativeTime(reg.lastChecked)}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Footer legend */}
          <div className="mt-4 pt-3 border-t flex items-center justify-between">
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Compliant</span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" /> Review Needed
              </span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Non-Compliant</span>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground">
              Full Audit Report <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row - Enhanced with gradient border hover effects */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Alerts Over Time */}
        <ChartCardWrapper gradientFrom="#f97316" gradientTo="#f59e0b">
          <Card className="border-0 shadow-none">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-50/0 via-orange-50/0 to-orange-100/50 dark:from-orange-950/0 dark:via-orange-950/0 dark:to-orange-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-orange-500" />
                Alerts Over Time
                <span className="text-[10px] text-muted-foreground font-normal">({timeRangeLabel})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative pt-2">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={alertsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" label={{ value: 'Date', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'oklch(0.556 0 0)' }} />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" width={35} label={{ value: 'Count', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: 'oklch(0.556 0 0)' }} />
                  <Tooltip content={alertsTooltip} />
                  <Bar dataKey="alerts" fill="#f97316" radius={[6, 6, 0, 0]} name="Alerts" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </ChartCardWrapper>

        {/* Risk Distribution - Enhanced Pie Chart */}
        <ChartCardWrapper gradientFrom="#10b981" gradientTo="#0ea5e9">
          <Card className="border-0 shadow-none">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/0 via-emerald-50/0 to-emerald-100/50 dark:from-emerald-950/0 dark:via-emerald-950/0 dark:to-emerald-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                Risk Distribution
                <span className="text-[10px] text-muted-foreground font-normal">by Client Rating</span>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">{timeRangeLabel}</p>
            </CardHeader>
            <CardContent className="relative pt-2">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={riskDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={false}
                    stroke="none"
                  >
                    {riskDistribution.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid oklch(0.922 0 0)', boxShadow: '0 8px 24px -4px rgba(0,0,0,0.1)' }}
                    formatter={(value: number, name: string) => {
                      const total = riskDistribution.reduce((sum, d) => sum + d.value, 0);
                      const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                      return [`${value} clients (${pct}%)`, name];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    formatter={(value: string, entry: { color?: string; payload?: { value?: number } }) => {
                      const total = riskDistribution.reduce((sum, d) => sum + d.value, 0);
                      const item = riskDistribution.find(d => d.name === value);
                      const itemValue = item?.value ?? entry.payload?.value ?? 0;
                      const pct = total > 0 ? ((itemValue / total) * 100).toFixed(0) : '0';
                      return `${value}: ${itemValue} (${pct}%)`;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </ChartCardWrapper>

        {/* Transaction Volume */}
        <ChartCardWrapper gradientFrom="#10b981" gradientTo="#14b8a6">
          <Card className="border-0 shadow-none">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-50/0 via-teal-50/0 to-teal-100/50 dark:from-teal-950/0 dark:via-teal-950/0 dark:to-teal-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                Transaction Volume
                <span className="text-[10px] text-muted-foreground font-normal">({timeRangeLabel})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative pt-2">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={txVolume}>
                  <defs>
                    <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" label={{ value: 'Date', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'oklch(0.556 0 0)' }} />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={formatCurrency} width={45} label={{ value: 'Volume ($)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: 'oklch(0.556 0 0)' }} />
                  <Tooltip content={volumeTooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="volume" stroke="#10b981" fill="url(#volumeGradient)" name="Volume (AUD)" strokeWidth={2} dot={{ r: 5, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 7, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </ChartCardWrapper>
      </div>

      {/* Compliance Workflow Progress Card */}
      <Card className="shadow-sm hover:shadow-md transition-all duration-300 border-border/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Compliance Workflow Progress
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-normal">
              {clients.length} clients
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            {(() => {
              const kycVerified = clients.filter((c: Record<string, unknown>) => c.kycStatus === 'verified' || c.kycStatus === 'complete').length;
              const sanctionsClear = clients.filter((c: Record<string, unknown>) => c.sanctionsStatus === 'clear' || c.sanctionsStatus === 'completed').length;
              const uboAnalyzed = clients.filter((c: Record<string, unknown>) => c.uboStatus === 'verified' || c.uboStatus === 'complete').length;
              const riskAssessed = clients.filter((c: Record<string, unknown>) => c.riskRating !== undefined && c.riskRating !== null).length;
              const reportsFiled = metrics.reportsFiled.smr + metrics.reportsFiled.ttr + metrics.reportsFiled.iftiE;

              const steps = [
                { label: 'KYC/KYB', completed: kycVerified, total: clients.length, icon: UserCheck },
                { label: 'Sanctions', completed: sanctionsClear, total: clients.length, icon: Shield },
                { label: 'UBO Analysis', completed: uboAnalyzed, total: clients.length, icon: Users },
                { label: 'Risk Assessment', completed: riskAssessed, total: clients.length, icon: BarChart3 },
                { label: 'Reporting', completed: Math.min(reportsFiled, clients.length), total: clients.length, icon: FileText },
              ];

              return steps.map((step, idx) => {
                const pct = Math.round((step.completed / step.total) * 100);
                const isComplete = pct >= 100;
                const isInProgress = pct > 0 && pct < 100;
                const barColor = isComplete ? 'bg-emerald-500' : isInProgress ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600';
                const StepIcon = step.icon;

                return (
                  <motion.div
                    key={step.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.08 }}
                    className="flex flex-col items-center gap-2 relative"
                  >
                    {idx < steps.length - 1 && (
                      <div className="hidden sm:block absolute top-6 -right-2 w-4 h-[2px] bg-border/40" />
                    )}
                    <div className={`p-2 rounded-xl ${isComplete ? 'bg-emerald-50 dark:bg-emerald-950/30' : isInProgress ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-slate-50 dark:bg-slate-800/30'}`}>
                      <StepIcon className={`h-4 w-4 ${isComplete ? 'text-emerald-600 dark:text-emerald-400' : isInProgress ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-semibold">{step.label}</p>
                      <p className="text-[10px] text-muted-foreground">{step.completed}/{step.total}</p>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted/40 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: idx * 0.1 }}
                        className={`h-full rounded-full ${barColor}`}
                      />
                    </div>
                    <span className={`text-[10px] font-bold ${isComplete ? 'text-emerald-600 dark:text-emerald-400' : isInProgress ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      {pct}%
                    </span>
                  </motion.div>
                );
              });
            })()}
          </div>
          <div className="mt-4 pt-3 border-t flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Complete</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> In Progress</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" /> Not Started</span>
          </div>
        </CardContent>
      </Card>

      {/* Risk Score Trend + Regulatory Compliance Status Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Risk Score Trend - New Line Chart */}
        <ChartCardWrapper gradientFrom="#64748b" gradientTo="#0ea5e9">
          <Card className="border-0 shadow-none">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50/0 via-sky-50/0 to-sky-100/50 dark:from-slate-950/0 dark:via-sky-950/0 dark:to-sky-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-sky-500" />
                Risk Score Trend
                <span className="text-[10px] text-muted-foreground font-normal">({timeRangeLabel})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative pt-2">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={riskTrendData}>
                  <defs>
                    <linearGradient id="riskTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" label={{ value: 'Date', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'oklch(0.556 0 0)' }} />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" domain={[0, 100]} width={35} label={{ value: 'Risk Score', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: 'oklch(0.556 0 0)' }} />
                  <Tooltip content={riskTrendTooltip} />
                  <Area type="monotone" dataKey="avgRisk" stroke="none" fill="url(#riskTrendGradient)" />
                  <Line
                    type="monotone"
                    dataKey="avgRisk"
                    stroke="#0ea5e9"
                    strokeWidth={2.5}
                    dot={{ r: 5, fill: '#0ea5e9', strokeWidth: 0 }}
                    activeDot={{ r: 7, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }}
                    name="Avg Risk Score"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </ChartCardWrapper>

        {/* Regulatory Compliance Status Widget - New */}
        <Card className="shadow-sm hover:shadow-md transition-all duration-300">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                Regulatory Compliance
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-normal">
                {REGULATION_STATUSES.filter(r => r.status === 'compliant').length}/{REGULATION_STATUSES.length} compliant
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
              {REGULATION_STATUSES.map((reg, idx) => {
                const config = getRegStatusConfig(reg.status);
                const StatusIcon = config.icon;
                return (
                  <motion.div
                    key={reg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: idx * 0.06 }}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${config.borderColor} ${config.bgColor} transition-all duration-200 hover:shadow-sm`}
                  >
                    <div className="flex-shrink-0 relative">
                      <div className={`h-2.5 w-2.5 rounded-full ${config.dotColor}`} />
                      {reg.status === 'review' && (
                        <div className={`absolute inset-0 h-2.5 w-2.5 rounded-full ${config.dotColor} animate-ping opacity-40`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold truncate">{reg.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <StatusIcon className={`h-3 w-3 ${config.textColor}`} />
                        <span className={`text-[10px] font-medium ${config.textColor}`}>{config.label}</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-muted-foreground flex-shrink-0 text-right leading-tight">
                      <div>Checked</div>
                      <div className="font-medium">{getRelativeTime(reg.lastChecked)}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Compliance status footer */}
            <div className="mt-4 pt-3 border-t flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Compliant</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Review</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Non-Compliant</span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground">
                View Details <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Assessment Heatmap + Compliance Calendar Row - Enhanced */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Risk Assessment Matrix */}
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Risk Assessment Matrix
              </CardTitle>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>Less</span>
                <div className="flex gap-0.5">
                  <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#dcfce7' }} title="0 alerts" />
                  <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#bbf7d0' }} title="Low" />
                  <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#fef08a' }} title="Medium" />
                  <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#fed7aa' }} title="High" />
                  <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#fecaca' }} title="Critical" />
                </div>
                <span>More</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div
                className="grid gap-[3px] min-w-[440px]"
                style={{
                  gridTemplateColumns: `150px repeat(${CLIENT_RISK_LEVELS.length}, 1fr)`,
                }}
              >
                {/* Header row */}
                <div className="text-[10px] font-semibold text-muted-foreground flex items-end pb-1.5 pr-2 uppercase tracking-wider">
                  Risk Category
                </div>
                {CLIENT_RISK_LEVELS.map(level => (
                  <div
                    key={level}
                    className="text-[11px] font-bold text-center pb-1.5 flex items-end justify-center"
                    style={{ color: RISK_COLORS[level] }}
                  >
                    {RISK_LEVEL_LABELS[level]}
                  </div>
                ))}

                {/* Data rows */}
                {RISK_CATEGORIES.map(cat => (
                  <React.Fragment key={cat.key}>
                    <div className="text-xs font-medium text-foreground flex items-center pr-2 py-2">
                      {cat.label}
                    </div>
                    {CLIENT_RISK_LEVELS.map(level => {
                      const count = heatmapData.matrix[cat.key]?.[level] ?? 0;
                      const cellStyle = getHeatmapCellStyle(count, heatmapData.maxCount);
                      const isHighCritical = (level === 'high' || level === 'critical') && count > 0;
                      return (
                        <div
                          key={`${cat.key}-${level}`}
                          className={`flex items-center justify-center py-3 rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-md cursor-default ${isHighCritical ? 'animate-pulse' : ''} ${count > 0 ? 'font-extrabold' : 'font-bold'}`}
                          style={{
                            backgroundColor: cellStyle.backgroundColor,
                            color: cellStyle.textColor,
                          }}
                          title={`${cat.label} × ${RISK_LEVEL_LABELS[level]}: ${count} alert${count !== 1 ? 's' : ''}`}
                        >
                          <span className="text-sm">{count}</span>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Heatmap summary */}
            <div className="mt-4 pt-3 border-t flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Total alerts mapped: <span className="font-semibold text-foreground">{alerts.length}</span></span>
              <div className="flex items-center gap-2">
                <span>Based on <span className="font-semibold text-foreground">{clients.length}</span> clients</span>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground" onClick={() => onNavigate?.('transactions')}>
                  View Details <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Regulatory Deadline Tracker - Enhanced */}
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Regulatory Deadline Tracker
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-normal">
                {complianceEvents.filter(e => getDaysUntil(e.date) <= 7).length} due soon
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {/* Top 3 Upcoming Deadlines as Prominent Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {complianceEvents.slice(0, 3).map((event) => {
                const daysUntil = getDaysUntil(event.date);
                const isOverdue = daysUntil < 0;
                const isThisWeek = daysUntil >= 0 && daysUntil <= 7;
                const borderColor = isOverdue
                  ? 'border-l-4 border-l-red-500'
                  : isThisWeek
                    ? 'border-l-4 border-l-amber-500'
                    : 'border-l-4 border-l-emerald-500';
                const urgencyLabel = getUrgencyLabel(daysUntil);
                const urgencyTextColor = isOverdue
                  ? 'text-red-600 dark:text-red-400'
                  : isThisWeek
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400';
                const urgencyBg = isOverdue
                  ? 'bg-red-50 dark:bg-red-950/20'
                  : isThisWeek
                    ? 'bg-amber-50 dark:bg-amber-950/20'
                    : 'bg-emerald-50 dark:bg-emerald-950/20';

                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`p-3 rounded-xl border-2 ${borderColor} ${urgencyBg} transition-all duration-200 hover:shadow-lg hover:scale-[1.03] cursor-default`}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-5 ${event.categoryColor}`}>
                        {event.category}
                      </Badge>
                      {(isOverdue || isThisWeek) && (
                        <Zap className={`h-3 w-3 ${isOverdue ? 'text-red-500' : 'text-amber-500'} animate-pulse`} />
                      )}
                    </div>
                    <h4 className={`text-xs font-bold mb-1 ${isOverdue ? 'text-red-700 dark:text-red-400' : 'text-foreground'}`}>
                      {event.title}
                    </h4>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {event.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className={`text-xs font-bold ${urgencyTextColor}`}>
                        {urgencyLabel}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Remaining Deadlines as Compact List */}
            <ScrollArea className="h-[120px] pr-1" style={{ scrollbarGutter: 'stable' }}>
              <div className="space-y-1">
                <AnimatePresence mode="popLayout">
                  {complianceEvents.slice(3).map((event, idx) => {
                    const daysUntil = getDaysUntil(event.date);
                    const urgencyColor = getUrgencyColor(daysUntil);
                    const urgencyLabel = getUrgencyLabel(daysUntil);
                    const isOverdue = daysUntil < 0;
                    const isThisWeek = daysUntil >= 0 && daysUntil <= 7;

                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.04 }}
                        className={`flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 hover:bg-muted/40 ${
                          isOverdue ? 'ring-1 ring-red-200 dark:ring-red-800' : ''
                        }`}
                      >
                        <div className="relative flex-shrink-0">
                          <div className={`h-2.5 w-2.5 rounded-full ${urgencyColor}`} />
                          {(isOverdue || isThisWeek) && (
                            <div className={`absolute inset-0 h-2.5 w-2.5 rounded-full ${urgencyColor} animate-ping opacity-40`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs font-semibold truncate ${isOverdue ? 'text-red-600 dark:text-red-400' : ''}`}>
                            {event.title}
                          </span>
                        </div>
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-5 ${event.categoryColor}`}>
                          {event.category}
                        </Badge>
                        <span className={`text-[11px] font-bold min-w-[50px] text-right ${
                          isOverdue ? 'text-red-600 dark:text-red-400' : isThisWeek ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                        }`}>
                          {urgencyLabel}
                        </span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </ScrollArea>

            {/* Calendar footer */}
            <div className="mt-4 pt-3 border-t flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Overdue</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> This week</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Upcoming</span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground">
                View All Deadlines <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Activity Feed + Client Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Activity - Enhanced */}
        <Card className="lg:col-span-1 shadow-sm hover:shadow-md transition-shadow duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Recent Activity
              <Badge variant="outline" className="text-[9px] font-normal">{recentActivity.length} events</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-0.5">
                <AnimatePresence mode="popLayout">
                  {recentActivity.slice(0, 10).map((activity, idx) => {
                    // Determine left border color based on activity type
                    const actionUpper = activity.action.toUpperCase();
                    let borderColor = 'border-l-slate-400';
                    if (actionUpper.includes('CLIENT') && actionUpper.includes('CREAT')) borderColor = 'border-l-emerald-500';
                    else if (actionUpper.includes('ALERT')) borderColor = 'border-l-red-500';
                    else if (actionUpper.includes('REPORT')) borderColor = 'border-l-sky-500';
                    else if (actionUpper.includes('USER_LOGIN') || actionUpper.includes('LOGIN')) borderColor = 'border-l-slate-400';

                    return (
                      <motion.div
                        key={activity.id + idx}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: idx * 0.03 }}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border-l-4 ${borderColor} transition-all duration-200 hover:bg-gradient-to-r hover:from-muted/30 hover:to-transparent ${
                          activity.entityId && activity.entityType?.toLowerCase() === 'client' ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => {
                          if (activity.entityId && activity.entityType?.toLowerCase() === 'client') {
                            onClientSelect?.(activity.entityId);
                          }
                        }}
                      >
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${getActivityDotColor(activity.action)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">{activity.action.replace(/_/g, ' ')}</span>
                            <StatusBadge status={activity.entityType} />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {activity.userId ?? 'System'} &middot; {activity.entityType}
                            {activity.entityId && activity.entityType?.toLowerCase() === 'client' && (
                              <span className="ml-1 text-sky-600 dark:text-sky-400">→ View</span>
                            )}
                          </p>
                        </div>
                        <div className="text-[11px] text-muted-foreground shrink-0 font-medium">
                          {new Date(activity.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {recentActivity.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
                )}
              </div>
            </ScrollArea>
            <div className="mt-3 pt-2 border-t">
              <Button variant="ghost" size="sm" className="w-full h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground">
                View All Activity <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Client Activity Feed - New */}
        <Card className="lg:col-span-1 shadow-sm hover:shadow-md transition-shadow duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Client Activity
              <Badge variant="outline" className="text-[9px] font-normal">{clientActivityFeed.length} recent</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientActivityFeed.length > 0 ? (
              <ScrollArea className="h-64">
                <div className="space-y-0.5">
                  <AnimatePresence mode="popLayout">
                    {clientActivityFeed.map((activity, idx) => {
                      const actionLower = activity.action.toLowerCase();
                      let actionLabel = activity.action.replace(/_/g, ' ');
                      let actionColor = 'text-slate-600 dark:text-slate-400';
                      let actionBg = 'bg-slate-50 dark:bg-slate-800/50';

                      if (actionLower.includes('creat')) {
                        actionLabel = 'Created';
                        actionColor = 'text-emerald-700 dark:text-emerald-400';
                        actionBg = 'bg-emerald-50 dark:bg-emerald-950/30';
                      } else if (actionLower.includes('updat') || actionLower.includes('change')) {
                        actionLabel = 'Updated';
                        actionColor = 'text-amber-700 dark:text-amber-400';
                        actionBg = 'bg-amber-50 dark:bg-amber-950/30';
                      } else if (actionLower.includes('risk') || actionLower.includes('rating')) {
                        actionLabel = 'Risk Changed';
                        actionColor = 'text-red-700 dark:text-red-400';
                        actionBg = 'bg-red-50 dark:bg-red-950/30';
                      }

                      return (
                        <motion.div
                          key={activity.id + idx}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: idx * 0.05 }}
                          className="flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 hover:bg-muted/40 cursor-pointer"
                          onClick={() => {
                            if (activity.entityId) {
                              onClientSelect?.(activity.entityId);
                            }
                          }}
                        >
                          <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${actionBg} ${actionColor}`}>
                            {actionLabel}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">
                              {activity.details && typeof activity.details === 'object'
                                ? (activity.details as Record<string, unknown>)?.name ?? `Client ${activity.entityId?.slice(0, 8) ?? ''}`
                                : `Client ${activity.entityId?.slice(0, 8) ?? ''}`}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {activity.userId ?? 'System'}
                            </p>
                          </div>
                          <div className="text-[10px] text-muted-foreground shrink-0 font-medium">
                            {getRelativeTime(activity.timestamp)}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="p-3 rounded-full bg-muted/30 mb-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">No recent client activity</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions - Enhanced */}
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-amber-500" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {[
              { label: 'New Client', icon: Plus, hoverBg: 'hover:bg-sky-50 hover:border-sky-200 hover:text-sky-700 dark:hover:bg-sky-950/30 dark:hover:border-sky-800 dark:hover:text-sky-400', iconBg: 'bg-sky-100 dark:bg-sky-950/40', iconColor: 'text-sky-600 dark:text-sky-400', section: 'onboarding' as Section },
              { label: 'Upload Document', icon: Upload, hoverBg: 'hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:border-emerald-800 dark:hover:text-emerald-400', iconBg: 'bg-emerald-100 dark:bg-emerald-950/40', iconColor: 'text-emerald-600 dark:text-emerald-400', section: 'documents' as Section },
              { label: 'File Report', icon: FileCheck, hoverBg: 'hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 dark:hover:bg-amber-950/30 dark:hover:border-amber-800 dark:hover:text-amber-400', iconBg: 'bg-amber-100 dark:bg-amber-950/40', iconColor: 'text-amber-600 dark:text-amber-400', section: 'reporting' as Section },
              { label: 'View Alerts', icon: Eye, hoverBg: 'hover:bg-red-50 hover:border-red-200 hover:text-red-700 dark:hover:bg-red-950/30 dark:hover:border-red-800 dark:hover:text-red-400', iconBg: 'bg-red-100 dark:bg-red-950/40', iconColor: 'text-red-600 dark:text-red-400', section: 'transactions' as Section },
            ].map((action) => (
              <motion.div key={action.label} whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}>
                <Button
                  variant="outline"
                  className={`w-full justify-start gap-3 h-12 text-sm ${action.hoverBg} hover:translate-x-0.5 transition-all duration-200`}
                  onClick={() => onNavigate?.(action.section)}
                >
                  <div className={`p-2 rounded-lg ${action.iconBg} transition-transform duration-200 hover:scale-110`}>
                    <action.icon className={`h-4 w-4 ${action.iconColor}`} />
                  </div>
                  {action.label}
                </Button>
              </motion.div>
            ))}

            <div className="pt-4 mt-4 border-t">
              <div className="grid grid-cols-2 gap-3 text-center">
                <motion.div whileHover={{ scale: 1.04 }} className="p-3 rounded-xl bg-gradient-to-br from-sky-50/80 to-white dark:from-sky-950/20 dark:to-card border border-sky-100 dark:border-sky-900/40">
                  <div className="text-xl font-bold text-sky-700 dark:text-sky-400">{metrics.documentsAnalyzed}</div>
                  <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Docs Analyzed</div>
                </motion.div>
                <motion.div whileHover={{ scale: 1.04 }} className="p-3 rounded-xl bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-card border border-amber-100 dark:border-amber-900/40">
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{metrics.pendingOnboarding}</div>
                  <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Pending KYC</div>
                </motion.div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
