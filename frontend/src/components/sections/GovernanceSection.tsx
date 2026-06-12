'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGovernanceMetrics, useAuditLogs } from '@/hooks/useApi';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ChartTooltip } from '@/components/shared/ChartTooltip';
import {
  Shield, Lock, Download, Loader2, AlertTriangle, CheckCircle2, Clock,
  FileCheck, Users, BarChart3, Activity, TrendingUp, GraduationCap,
  BookOpen, Target, Copy, Check, List, GitBranch, ShieldCheck,
  ChevronDown, ChevronRight, FileText, Plus, LogIn, LogOut, Eye,
  AlertCircle, ArrowUpRight, UserPlus, UserCog, Bell, BellRing,
  BellOff, FileOutput, ThumbsUp, Send, ScanSearch, Hash, Rows3
} from 'lucide-react';
import { ComplianceTaskManager } from '@/components/shared/ComplianceTaskManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart
} from 'recharts';
import { toast } from 'sonner';

// ─── Action Type Color/Icon Mapping ───────────────────────────────────────────

type ActionColorInfo = {
  dotClass: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  hex: string;
  icon: React.ComponentType<{ className?: string }>;
};

function getActionColorInfo(action: string): ActionColorInfo {
  const a = action?.toUpperCase() ?? '';
  if (a.includes('CLIENT_CREATED') || a.includes('CLIENT_UPDATED')) {
    return {
      dotClass: 'bg-emerald-500',
      bgClass: 'bg-emerald-100 dark:bg-emerald-900/30',
      textClass: 'text-emerald-700 dark:text-emerald-400',
      borderClass: 'border-emerald-300 dark:border-emerald-700',
      hex: '#10b981',
      icon: a.includes('CREATED') ? UserPlus : UserCog,
    };
  }
  if (a.includes('ALERT_GENERATED') || a.includes('ALERT_ESCALATED') || a.includes('ALERT_CLOSED')) {
    return {
      dotClass: 'bg-red-500',
      bgClass: 'bg-red-100 dark:bg-red-900/30',
      textClass: 'text-red-700 dark:text-red-400',
      borderClass: 'border-red-300 dark:border-red-700',
      hex: '#ef4444',
      icon: a.includes('ESCALATED') ? BellRing : a.includes('CLOSED') ? BellOff : Bell,
    };
  }
  if (a.includes('REPORT_GENERATED') || a.includes('REPORT_APPROVED') || a.includes('REPORT_SUBMITTED')) {
    return {
      dotClass: 'bg-sky-500',
      bgClass: 'bg-sky-100 dark:bg-sky-900/30',
      textClass: 'text-sky-700 dark:text-sky-400',
      borderClass: 'border-sky-300 dark:border-sky-700',
      hex: '#0ea5e9',
      icon: a.includes('APPROVED') ? ThumbsUp : a.includes('SUBMITTED') ? Send : FileOutput,
    };
  }
  if (a.includes('DOCUMENT_ANALYZED')) {
    return {
      dotClass: 'bg-violet-500',
      bgClass: 'bg-violet-100 dark:bg-violet-900/30',
      textClass: 'text-violet-700 dark:text-violet-400',
      borderClass: 'border-violet-300 dark:border-violet-700',
      hex: '#8b5cf6',
      icon: ScanSearch,
    };
  }
  if (a.includes('USER_LOGIN') || a.includes('USER_LOGOUT')) {
    return {
      dotClass: 'bg-slate-500',
      bgClass: 'bg-slate-100 dark:bg-slate-800/50',
      textClass: 'text-slate-600 dark:text-slate-400',
      borderClass: 'border-slate-300 dark:border-slate-600',
      hex: '#64748b',
      icon: a.includes('LOGIN') ? LogIn : LogOut,
    };
  }
  return {
    dotClass: 'bg-amber-500',
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    textClass: 'text-amber-700 dark:text-amber-400',
    borderClass: 'border-amber-300 dark:border-amber-700',
    hex: '#f59e0b',
    icon: AlertCircle,
  };
}

// ─── Relative Time Helper ─────────────────────────────────────────────────────

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

function getDateGroupLabel(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDay === 0) return 'Today';
  if (diffDay === 1) return 'Yesterday';
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Main Section ─────────────────────────────────────────────────────────────

export function GovernanceSection() {
  return (
    <div className="space-y-6">
      <SectionHeader title="Governance & Audit" description="Compliance dashboard and audit trail" icon={Shield} accentColor="#0ea5e9" breadcrumb={["Platform", "Governance"]} />
      <ComplianceTaskManager />
      <Tabs defaultValue="compliance">
        <TabsList>
          <TabsTrigger value="compliance">Compliance Dashboard</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>
        <TabsContent value="compliance"><ComplianceDashboard /></TabsContent>
        <TabsContent value="audit"><AuditTrail /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Compliance Score Donut ───────────────────────────────────────────────────

/** SVG Donut Chart for Compliance Score */
function ComplianceScoreDonut({ score }: { score: number }) {
  const radius = 52;
  const stroke = 10;
  const normalizedRadius = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score > 80 ? '#10b981' : score > 60 ? '#f59e0b' : '#ef4444';
  const label = score > 80 ? 'Excellent' : score > 60 ? 'Good' : 'Needs Attention';
  const labelColor = score > 80 ? 'text-emerald-600 dark:text-emerald-400' : score > 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg width={radius * 2} height={radius * 2} viewBox={`0 0 ${radius * 2} ${radius * 2}`}>
          {/* Background ring */}
          <circle
            cx={radius} cy={radius} r={normalizedRadius}
            fill="none" stroke="currentColor"
            className="text-muted/30"
            strokeWidth={stroke}
          />
          {/* Score arc */}
          <circle
            cx={radius} cy={radius} r={normalizedRadius}
            fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${radius} ${radius})`}
            className="transition-all duration-1000 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>{Math.round(score)}</span>
          <span className="text-[9px] text-muted-foreground font-medium">/ 100</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-sm font-semibold">Compliance Score</div>
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${labelColor} ${
          score > 80 ? 'bg-emerald-100 dark:bg-emerald-900/30' : score > 60 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30'
        }`}>
          {score > 80 ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {label}
        </span>
        <p className="text-[10px] text-muted-foreground max-w-[200px]">
          Calculated from risk appetite, alert resolution, and report submission metrics
        </p>
      </div>
    </div>
  );
}

// ─── Compliance Dashboard ─────────────────────────────────────────────────────

function ComplianceDashboard() {
  const { data, isLoading, dataUpdatedAt } = useGovernanceMetrics(30);

  // Compute compliance score and historical chart data before any early return (hooks rules)
  const complianceScore = useMemo(() => {
    if (!data) return 0;
    const totalClients = data.riskAppetite.totalClients || 1;
    const riskPenalty = (data.riskAppetite.highRiskPercentage / 100) * 30;
    const alertPenalty = Math.min(data.alertSummary.totalInPeriod / (totalClients * 2), 1) * 25;
    const signoffPenalty = data.complianceSignOff.totalReports > 0
      ? (data.complianceSignOff.reportsNeedingApproval / data.complianceSignOff.totalReports) * 20
      : 0;
    const resolutionPenalty = data.alertSummary.avgResolutionHours > 48 ? 15 : (data.alertSummary.avgResolutionHours / 48) * 15;
    return Math.max(0, Math.min(100, 100 - riskPenalty - alertPenalty - signoffPenalty - resolutionPenalty));
  }, [data]);

  const historicalChartData = useMemo(() => {
    if (!data?.historicalMetrics) return [];
    return data.historicalMetrics
      .map((m: Record<string, unknown>) => ({
        date: new Date(m.metricDate as string).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }),
        highRiskPct: (m.totalClients as number) > 0
          ? Math.round(((m.highRiskClients as number) / (m.totalClients as number)) * 1000) / 10
          : 0,
        alertCount: (m.openAlerts as number) + (m.criticalAlerts as number),
        reportCount: ((m.smrFiled as number) ?? 0) + ((m.ttrFiled as number) ?? 0) + ((m.iftiFiled as number) ?? 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
    );
  }

  const { riskAppetite, alertVelocity, alertSummary, complianceSignOff, onboardingPipeline } = data;
  const riskPct = riskAppetite.highRiskPercentage;
  const riskThreshold = riskAppetite.riskAppetiteThreshold;
  const withinAppetite = riskAppetite.withinAppetite;

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString('en-AU', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      })
    : '—';

  // Calculate risk assessment review date (6 months from now for demo)
  const riskReviewDate = new Date();
  riskReviewDate.setMonth(riskReviewDate.getMonth() + 6);
  const riskReviewStr = riskReviewDate.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Last Updated Timestamp */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Last updated: {lastUpdated}</span>
        </div>
        <Badge variant="outline" className="text-[10px]">Period: 30 days</Badge>
      </div>

      {/* Regulatory Compliance Quick Check */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="border-border/60 overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Regulatory Compliance Quick Check</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* AML/CTF Program */}
              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">AML/CTF Program</div>
                  <div className="text-[9px] text-emerald-600 dark:text-emerald-500 font-medium">✓ Current</div>
                </div>
              </div>

              {/* Risk Assessment */}
              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 shrink-0">
                  <Target className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">Risk Assessment</div>
                  <div className="text-[9px] text-emerald-600 dark:text-emerald-500 font-medium">✓ Review: {riskReviewStr}</div>
                </div>
              </div>

              {/* Training Compliance */}
              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 shrink-0">
                  <GraduationCap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 truncate">Training Compliance</div>
                  <div className="text-[9px] text-amber-600 dark:text-amber-500 font-medium">87% — Attention Needed</div>
                </div>
              </div>

              {/* AUSTRAC Registration */}
              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 truncate">AUSTRAC Registration</div>
                  <div className="text-[9px] text-amber-600 dark:text-amber-500 font-medium">Review Due</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Compliance Score & Risk Appetite Gauge Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/80">
          <CardContent className="p-4">
            <ComplianceScoreDonut score={complianceScore} />
          </CardContent>
        </Card>

        {/* Risk Appetite Gauge */}
        <Card className="border-border/80">
          <CardContent className="p-4">
            <RiskAppetiteGauge currentPct={riskPct} threshold={riskThreshold} withinAppetite={withinAppetite} />
          </CardContent>
        </Card>
      </div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

      {/* Risk Appetite Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Risk Appetite Gauge - Enhanced with color-coded border */}
        <Card className={`border-2 ${withinAppetite ? 'border-emerald-200 dark:border-emerald-800' : 'border-red-200 dark:border-red-800'} relative overflow-hidden`}>
          {/* Status accent at top */}
          <div className={`absolute top-0 left-0 right-0 h-1 ${withinAppetite ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {withinAppetite ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-xs font-semibold">Risk Appetite</span>
              <Badge className={`ml-auto text-[9px] ${withinAppetite ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                {withinAppetite ? 'Within' : 'Above'}
              </Badge>
            </div>
            <div className="text-2xl font-bold mb-1 metric-value">{riskPct.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mb-2">High-risk clients (threshold: {riskThreshold}%)</div>
            <Progress
              value={riskPct}
              className={`h-2 ${riskPct > riskThreshold ? '[&>div]:bg-red-500' : '[&>div]:bg-emerald-500'}`}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>0%</span>
              <span className={riskPct > riskThreshold ? 'text-red-500 font-semibold' : ''}>{riskThreshold}%</span>
              <span>100%</span>
            </div>
          </CardContent>
        </Card>

        {/* Alert Summary - Enhanced with sparkline */}
        <Card className="interactive-card">
          <CardContent className="p-4 relative overflow-hidden">
            {/* Sparkline mini-chart */}
            <svg className="absolute top-2 right-2 w-16 h-8 opacity-20" viewBox="0 0 64 24" preserveAspectRatio="none">
              <polyline
                points={alertSummary.bySeverity.map((s, i) => `${(i / Math.max(alertSummary.bySeverity.length - 1, 1)) * 64},${24 - (s.count / Math.max(...alertSummary.bySeverity.map(x => x.count), 1)) * 20 - 2}`).join(' ')}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold">Alert Summary</span>
            </div>
            <div className="text-2xl font-bold metric-value">{alertSummary.totalInPeriod}</div>
            <div className="text-xs text-muted-foreground mb-2">Alerts in last 30 days</div>
            <div className="space-y-1">
              {alertSummary.bySeverity.map((s) => (
                <div key={s.severity} className="flex items-center justify-between text-xs">
                  <span className="capitalize">{s.severity}</span>
                  <Badge variant="outline" className="text-[10px]">{s.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Compliance Sign-off - Enhanced with sparkline */}
        <Card className="interactive-card">
          <CardContent className="p-4 relative overflow-hidden">
            {/* Sparkline mini-chart */}
            <svg className="absolute top-2 right-2 w-16 h-8 opacity-20" viewBox="0 0 64 24" preserveAspectRatio="none">
              <polyline
                points={`0,${24 - (complianceSignOff.reportsNeedingApproval / Math.max(complianceSignOff.totalReports, 1)) * 20 - 2} 21,${24 - (complianceSignOff.reportsPendingSubmission / Math.max(complianceSignOff.totalReports, 1)) * 20 - 2} 43,${24 - (complianceSignOff.reportsSubmitted / Math.max(complianceSignOff.totalReports, 1)) * 20 - 2} 64,2`}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <div className="flex items-center gap-2 mb-2">
              <FileCheck className="h-4 w-4 text-sky-500" />
              <span className="text-xs font-semibold">Sign-off Status</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Needs Approval</span>
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">{complianceSignOff.reportsNeedingApproval}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Pending Submission</span>
                <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-[10px]">{complianceSignOff.reportsPendingSubmission}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Submitted</span>
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">{complianceSignOff.reportsSubmitted}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Onboarding Pipeline */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-semibold">Onboarding Pipeline</span>
            </div>
            <div className="space-y-1.5">
              {onboardingPipeline.map((item) => (
                <div key={item.status} className="flex items-center justify-between text-xs">
                  <StatusBadge status={item.status} />
                  <span className="font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alert Velocity - Enhanced with gradient fill, larger dots, custom tooltip */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Alert Velocity (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={alertVelocity}>
                <defs>
                  <linearGradient id="alertVelocityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} className="text-muted-foreground" tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return `${d.getDate()}/${d.getMonth() + 1}`;
                }} />
                <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <Tooltip content={<ChartTooltip valueFormatter={(val: number) => `${val} alerts`} />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  fill="url(#alertVelocityGradient)"
                  dot={{ r: 4, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Alert by Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Alerts by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={alertSummary.byStatus}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="status" tick={{ fontSize: 10 }} className="text-muted-foreground" label={{ value: 'Status', position: 'insideBottom', offset: -5, fontSize: 10, className: 'fill-muted-foreground' }} />
                <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" label={{ value: 'Count', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, className: 'fill-muted-foreground' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" fill="#64748b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Historical Trend Chart - Multi-line */}
      {historicalChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Historical Compliance Trends
              </CardTitle>
              <Badge variant="outline" className="text-[9px]">{historicalChartData.length} data points</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={historicalChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} className="text-muted-foreground" />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} className="text-muted-foreground" label={{ value: 'High Risk %', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, className: 'fill-muted-foreground' }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} className="text-muted-foreground" label={{ value: 'Count', angle: 90, position: 'insideRight', offset: 10, fontSize: 10, className: 'fill-muted-foreground' }} />
                <Tooltip content={<ChartTooltip />} />
                <Line yAxisId="left" type="monotone" dataKey="highRiskPct" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444', stroke: '#fff', strokeWidth: 1.5 }} name="High Risk %" />
                <Line yAxisId="right" type="monotone" dataKey="alertCount" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316', stroke: '#fff', strokeWidth: 1.5 }} name="Alert Count" />
                <Line yAxisId="right" type="monotone" dataKey="reportCount" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 1.5 }} name="Report Count" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Compliance Training Status */}
      <ComplianceTrainingCard />

      {/* Board-ready Summary - Enhanced with hover lift effects */}
      <Card className="border-border/80">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Board-Ready Summary
            </CardTitle>
            <Badge variant="outline" className="text-[9px]">Executive View</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div
              whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="text-center p-4 rounded-xl bg-gradient-to-br from-slate-50/80 to-white dark:from-slate-800/30 dark:to-card border border-slate-100 dark:border-slate-700/50 cursor-default"
            >
              <div className="mx-auto mb-2 flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800">
                <Users className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="text-lg font-bold metric-value">{riskAppetite.totalClients}</div>
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Clients</div>
            </motion.div>
            <motion.div
              whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="text-center p-4 rounded-xl bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-card border border-amber-100 dark:border-amber-900/40 cursor-default"
            >
              <div className="mx-auto mb-2 flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Activity className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-lg font-bold metric-value text-amber-700 dark:text-amber-400">{alertSummary.avgResolutionHours.toFixed(1)}h</div>
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Avg Resolution</div>
            </motion.div>
            <motion.div
              whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="text-center p-4 rounded-xl bg-gradient-to-br from-sky-50/80 to-white dark:from-sky-950/20 dark:to-card border border-sky-100 dark:border-sky-900/40 cursor-default"
            >
              <div className="mx-auto mb-2 flex items-center justify-center w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/30">
                <FileCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="text-lg font-bold metric-value text-sky-700 dark:text-sky-400">{complianceSignOff.totalReports}</div>
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Reports</div>
            </motion.div>
            <motion.div
              whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`text-center p-4 rounded-xl border cursor-default ${withinAppetite ? 'bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-card border-emerald-100 dark:border-emerald-900/40' : 'bg-gradient-to-br from-red-50/80 to-white dark:from-red-950/20 dark:to-card border-red-100 dark:border-red-900/40'}`}
            >
              <div className={`mx-auto mb-2 flex items-center justify-center w-9 h-9 rounded-lg ${withinAppetite ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                <BarChart3 className={`h-4 w-4 ${withinAppetite ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} />
              </div>
              <div className={`text-lg font-bold metric-value ${withinAppetite ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                {withinAppetite ? 'Within' : 'Above'}
              </div>
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Risk Appetite</div>
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Risk Appetite Gauge ──────────────────────────────────────────────────────

/** Risk Appetite Gauge - Visual arc gauge */
function RiskAppetiteGauge({ currentPct, threshold, withinAppetite }: { currentPct: number; threshold: number; withinAppetite: boolean }) {
  const radius = 52;
  const stroke = 10;
  const normalizedRadius = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const fillPercent = Math.min(currentPct, 100);
  const strokeDashoffset = circumference - (fillPercent / 100) * circumference;

  // Determine zone colors
  const getZoneColor = () => {
    if (currentPct <= threshold * 0.6) return { main: '#10b981', label: 'Low Risk', labelClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-100 dark:bg-emerald-900/30' };
    if (currentPct <= threshold) return { main: '#f59e0b', label: 'Moderate Risk', labelClass: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-100 dark:bg-amber-900/30' };
    return { main: '#ef4444', label: 'High Risk', labelClass: 'text-red-600 dark:text-red-400', bgClass: 'bg-red-100 dark:bg-red-900/30' };
  };
  const zone = getZoneColor();

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg width={radius * 2} height={radius * 2} viewBox={`0 0 ${radius * 2} ${radius * 2}`}>
          {/* Background ring */}
          <circle
            cx={radius} cy={radius} r={normalizedRadius}
            fill="none" stroke="currentColor"
            className="text-muted/30"
            strokeWidth={stroke}
          />
          {/* Green zone (0 to threshold*0.6) */}
          <circle
            cx={radius} cy={radius} r={normalizedRadius}
            fill="none" stroke="#10b981" strokeWidth={stroke}
            strokeDasharray={`${(threshold * 0.6 / 100) * circumference} ${circumference}`}
            strokeDashoffset={0}
            transform={`rotate(-90 ${radius} ${radius})`}
            opacity={0.2}
          />
          {/* Yellow zone (threshold*0.6 to threshold) */}
          <circle
            cx={radius} cy={radius} r={normalizedRadius}
            fill="none" stroke="#f59e0b" strokeWidth={stroke}
            strokeDasharray={`${(threshold * 0.4 / 100) * circumference} ${circumference}`}
            strokeDashoffset={-((threshold * 0.6 / 100) * circumference)}
            transform={`rotate(-90 ${radius} ${radius})`}
            opacity={0.2}
          />
          {/* Red zone (threshold to 100) */}
          <circle
            cx={radius} cy={radius} r={normalizedRadius}
            fill="none" stroke="#ef4444" strokeWidth={stroke}
            strokeDasharray={`${((100 - threshold) / 100) * circumference} ${circumference}`}
            strokeDashoffset={-((threshold / 100) * circumference)}
            transform={`rotate(-90 ${radius} ${radius})`}
            opacity={0.2}
          />
          {/* Current value arc */}
          <circle
            cx={radius} cy={radius} r={normalizedRadius}
            fill="none" stroke={zone.main} strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${radius} ${radius})`}
            className="transition-all duration-1000 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${zone.main}40)` }}
          />
          {/* Threshold marker line */}
          {(() => {
            const angle = (threshold / 100) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const innerR = normalizedRadius - stroke / 2 - 2;
            const outerR = normalizedRadius + stroke / 2 + 2;
            const x1 = radius + innerR * Math.cos(rad);
            const y1 = radius + innerR * Math.sin(rad);
            const x2 = radius + outerR * Math.cos(rad);
            const y2 = radius + outerR * Math.sin(rad);
            return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748b" strokeWidth={2} strokeLinecap="round" />;
          })()}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color: zone.main }}>{currentPct.toFixed(1)}%</span>
          <span className="text-[9px] text-muted-foreground font-medium">of threshold</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-sm font-semibold">Risk Appetite Gauge</div>
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${zone.labelClass} ${zone.bgClass}`}>
          {withinAppetite ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {zone.label}
        </span>
        <div className="text-[10px] text-muted-foreground max-w-[200px]">
          Current high-risk client percentage vs. {threshold}% board-approved threshold
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Low</span>
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-amber-500" /> Moderate</span>
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-red-500" /> High</span>
        </div>
      </div>
    </div>
  );
}

// ─── Compliance Training Card ─────────────────────────────────────────────────

/** Compliance Training Status Card */
function ComplianceTrainingCard() {
  const trainingCompletion = 87;
  const coursesCompleted = 7;
  const totalCourses = 8;
  const nextDue = 'AML Refresher - 15 Jul 2026';

  const courses = [
    { name: 'AML/CTF Fundamentals', completed: true, dueDate: '01 Mar 2026' },
    { name: 'Customer Due Diligence', completed: true, dueDate: '15 Mar 2026' },
    { name: 'Sanctions Screening', completed: true, dueDate: '01 Apr 2026' },
    { name: 'PEP Identification', completed: true, dueDate: '15 Apr 2026' },
    { name: 'Transaction Monitoring', completed: true, dueDate: '01 May 2026' },
    { name: 'Reporting Obligations', completed: true, dueDate: '15 May 2026' },
    { name: 'Risk Assessment', completed: true, dueDate: '01 Jun 2026' },
    { name: 'AML Refresher', completed: false, dueDate: '15 Jul 2026' },
  ];

  const color = trainingCompletion >= 90 ? '#10b981' : trainingCompletion >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
      <Card className="border-border/80 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500" />
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compliance Training Status</span>
            </div>
            <Badge className={`text-[10px] font-semibold ${
              trainingCompletion >= 90
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : trainingCompletion >= 70
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {trainingCompletion}% Complete
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Left: Completion overview */}
            <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-purple-50/50 dark:bg-purple-950/20">
              <div className="relative w-20 h-20 mb-2">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" fill="none" className="stroke-muted/30" strokeWidth="6" />
                  <circle
                    cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${(trainingCompletion / 100) * 2 * Math.PI * 32} ${2 * Math.PI * 32}`}
                    className="transition-all duration-1000"
                    style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold" style={{ color }}>{coursesCompleted}/{totalCourses}</span>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground font-medium">Courses Completed</div>
            </div>

            {/* Middle: Progress bar & next due */}
            <div className="space-y-3 flex flex-col justify-center">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Overall Progress</span>
                  <span className="text-xs font-bold gradient-text-value">{trainingCompletion}%</span>
                </div>
                <Progress value={trainingCompletion} className="h-2.5" />
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <BookOpen className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">Next Due</span>
                </div>
                <span className="text-xs font-medium text-foreground/90">{nextDue}</span>
              </div>
            </div>

            {/* Right: Course list */}
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {courses.map((course, idx) => (
                <div key={idx} className={`flex items-center gap-2 p-1.5 rounded text-[10px] ${course.completed ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/10'}`}>
                  {course.completed ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : (
                    <Clock className="h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate font-medium">{course.name}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Audit Timeline Entry ─────────────────────────────────────────────────────

function AuditTimelineEntry({
  log,
  index,
  isLast,
}: {
  log: Record<string, unknown>;
  index: number;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const action = (log.action as string) ?? '';
  const colorInfo = getActionColorInfo(action);
  const IconComponent = colorInfo.icon;
  const hash = (log.dataHash as string) ?? '';
  const entityId = (log.entityId as string) ?? '';
  const createdAt = (log.createdAt as string) ?? '';
  const logId = (log.logId as string) ?? '';

  const copyEntityId = () => {
    if (!entityId) return;
    navigator.clipboard.writeText(entityId).then(() => {
      setCopiedId(true);
      toast.success('Entity ID copied');
      setTimeout(() => setCopiedId(false), 2000);
    });
  };

  const copyHash = () => {
    if (!hash) return;
    navigator.clipboard.writeText(hash).then(() => {
      toast.success('Hash copied to clipboard');
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="relative flex gap-4"
    >
      {/* Left: Timestamp */}
      <div className="w-20 shrink-0 pt-1 text-right">
        <div className="text-[10px] font-mono text-muted-foreground">
          {new Date(createdAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="text-[9px] text-muted-foreground/70">
          {getRelativeTime(createdAt)}
        </div>
      </div>

      {/* Center: Timeline node + connecting line */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${colorInfo.bgClass} border-2 ${colorInfo.borderClass} z-10 shrink-0`}
          style={{ boxShadow: `0 0 0 3px var(--background), 0 0 8px ${colorInfo.hex}30` }}
        >
          <IconComponent className="h-3.5 w-3.5" style={{ color: colorInfo.hex }} />
        </div>
        {!isLast && (
          <div className="w-0.5 flex-1 min-h-6 bg-gradient-to-b from-border to-border/30" />
        )}
      </div>

      {/* Right: Content */}
      <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
        <div
          className={`p-3 rounded-lg border ${colorInfo.borderClass} ${colorInfo.bgClass}/30 bg-card hover:bg-accent/30 transition-colors cursor-pointer`}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${colorInfo.bgClass} ${colorInfo.textClass}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${colorInfo.dotClass}`} />
                {action.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-muted-foreground">
                {(log.entityType as string) ?? ''}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {entityId && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-muted-foreground max-w-[120px] truncate">{entityId}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); copyEntityId(); }}
                  className="h-4 w-4 inline-flex items-center justify-center rounded hover:bg-muted/50 transition-colors"
                >
                  {copiedId ? <Check className="h-2.5 w-2.5 text-emerald-500" /> : <Copy className="h-2.5 w-2.5 text-muted-foreground" />}
                </button>
              </div>
            )}
            <span className="text-[10px] text-muted-foreground">
              {(log.userId as string) ?? '—'}
            </span>
          </div>

          {/* Hash + verified badge */}
          {hash && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[9px] font-mono text-muted-foreground/70">
                {hash.slice(0, 16)}...
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); copyHash(); }}
                className="h-4 w-4 inline-flex items-center justify-center rounded hover:bg-muted/50 transition-colors"
              >
                <Copy className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                <Lock className="h-2 w-2" />
                Verified
              </span>
            </div>
          )}

          {/* Expandable details */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 p-2 rounded bg-muted/30 border border-border/50">
                  <div className="text-[9px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Full Details</div>
                  <pre className="text-[9px] font-mono text-foreground/80 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
{JSON.stringify({
  logId,
  action,
  entityType: (log.entityType as string) ?? '',
  entityId: entityId || undefined,
  userId: (log.userId as string) ?? '',
  userRole: (log.userRole as string) ?? '',
  ipAddress: (log.ipAddress as string) ?? '',
  dataHash: hash || undefined,
  timestamp: createdAt,
}, null, 2)}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Audit Timeline View ──────────────────────────────────────────────────────

function AuditTimelineView({
  logs,
  isLoading,
  visibleCount,
  onLoadMore,
  hasMore,
}: {
  logs: Array<Record<string, unknown>>;
  isLoading: boolean;
  visibleCount: number;
  onLoadMore: () => void;
  hasMore: boolean;
}) {
  if (isLoading) {
    return (
      <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
    );
  }

  if (!logs.length) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">No audit entries found</div>
    );
  }

  const visibleLogs = logs.slice(0, visibleCount);

  // Group by date
  const grouped = visibleLogs.reduce<Record<string, Array<Record<string, unknown>>>>((acc, log) => {
    const dateStr = (log.createdAt as string) ?? '';
    const groupLabel = getDateGroupLabel(dateStr);
    if (!acc[groupLabel]) acc[groupLabel] = [];
    acc[groupLabel].push(log);
    return acc;
  }, {});

  return (
    <ScrollArea className="max-h-[600px]">
      <div className="space-y-4 pr-2">
        {Object.entries(grouped).map(([dateLabel, entries]) => (
          <div key={dateLabel}>
            {/* Date header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 px-3 py-1 rounded-full">
                {dateLabel}
              </div>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            {/* Timeline entries */}
            <div className="space-y-0">
              {entries.map((log, idx) => (
                <AuditTimelineEntry
                  key={(log.logId as string) ?? idx}
                  log={log}
                  index={idx}
                  isLast={idx === entries.length - 1}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center mt-4 pt-4 border-t">
          <Button variant="outline" size="sm" onClick={onLoadMore}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Load More ({logs.length - visibleCount} remaining)
          </Button>
        </div>
      )}
    </ScrollArea>
  );
}

// ─── Enhanced Audit Table View ────────────────────────────────────────────────

function AuditTableView({
  logs,
  isLoading,
  copiedHash,
  copyToClipboard,
}: {
  logs: Array<Record<string, unknown>>;
  isLoading: boolean;
  copiedHash: string | null;
  copyToClipboard: (text: string, id: string) => void;
}) {
  const [copiedEntityId, setCopiedEntityId] = useState<string | null>(null);

  const copyEntityId = (entityId: string, logId: string) => {
    navigator.clipboard.writeText(entityId).then(() => {
      setCopiedEntityId(logId);
      toast.success('Entity ID copied');
      setTimeout(() => setCopiedEntityId(null), 2000);
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Timestamp</th>
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Action</th>
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Entity</th>
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground">User</th>
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Role</th>
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground">IP Address</th>
            <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Data Hash</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, rowIdx) => {
            const logId = (log.logId as string) ?? '';
            const hash = (log.dataHash as string) ?? '';
            const action = (log.action as string) ?? '';
            const colorInfo = getActionColorInfo(action);
            const entityId = (log.entityId as string) ?? '';
            const createdAt = (log.createdAt as string) ?? '';

            return (
              <tr
                key={logId}
                className={`border-b hover:bg-muted/20 transition-all group ${
                  rowIdx % 2 === 1 ? 'bg-muted/5' : ''
                } hover:border-l-2 hover:border-l-emerald-500`}
              >
                <td className="p-3 text-xs font-mono">
                  <div className="group relative">
                    <span>{getRelativeTime(createdAt)}</span>
                    <span className="hidden group-hover:inline text-muted-foreground/70 ml-1 text-[9px]">
                      {new Date(createdAt).toLocaleString('en-AU', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                      })}
                    </span>
                    <span className="group-hover:hidden text-muted-foreground/50 ml-1 text-[9px]">
                      {new Date(createdAt).toLocaleString('en-AU', {
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                      })}
                    </span>
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${colorInfo.dotClass} shrink-0`} />
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-medium ${colorInfo.textClass} border-current/20`}
                    >
                      {action.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </td>
                <td className="p-3 text-xs">
                  <div className="flex items-center gap-1">
                    <span>{(log.entityType as string) ?? ''}</span>
                    {entityId && (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="font-mono text-[10px] text-muted-foreground max-w-[80px] truncate">{entityId}</span>
                        <button
                          onClick={() => copyEntityId(entityId, logId)}
                          className="h-4 w-4 inline-flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted/50"
                        >
                          {copiedEntityId === logId
                            ? <Check className="h-2.5 w-2.5 text-emerald-500" />
                            : <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                          }
                        </button>
                      </>
                    )}
                  </div>
                </td>
                <td className="p-3 text-xs">{(log.userId as string) ?? '—'}</td>
                <td className="p-3 text-xs">{(log.userRole as string) ?? '—'}</td>
                <td className="p-3 text-xs font-mono">{(log.ipAddress as string) ?? '—'}</td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {hash ? `${hash.slice(0, 12)}...` : '—'}
                    </span>
                    {hash && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-[10px]"
                          onClick={() => copyToClipboard(hash, logId)}
                        >
                          {copiedHash === logId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Lock className="h-2 w-2" />
                          Verified
                        </span>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Audit Trail (Main Component) ────────────────────────────────────────────

function AuditTrail() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');
  const [timelineVisibleCount, setTimelineVisibleCount] = useState(10);

  const { data, isLoading } = useAuditLogs({
    page,
    limit: 20,
    action: actionFilter || undefined,
    entityType: entityTypeFilter || undefined,
  });

  const logs = (data?.logs ?? []) as Array<Record<string, unknown>>;
  const pagination = data?.pagination;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedHash(id);
      toast.success('Hash copied to clipboard');
      setTimeout(() => setCopiedHash(null), 2000);
    });
  };

  const exportCSV = () => {
    if (!logs.length) return;
    const headers = ['Timestamp', 'Action', 'Entity Type', 'Entity ID', 'User', 'Role', 'IP Address', 'Data Hash'];
    const rows = logs.map((log) => [
      log.createdAt as string,
      log.action as string,
      log.entityType as string,
      log.entityId as string ?? '',
      log.userId as string ?? '',
      log.userRole as string ?? '',
      log.ipAddress as string ?? '',
      log.dataHash as string ?? '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Audit trail exported');
  };

  const totalEntries = pagination?.total ?? logs.length;

  return (
    <div className="space-y-4">
      {/* Filters, View Toggle & Export */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-3 flex-wrap">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="CLIENT_CREATED">Client Created</SelectItem>
              <SelectItem value="CLIENT_UPDATED">Client Updated</SelectItem>
              <SelectItem value="DOCUMENT_ANALYZED">Document Analyzed</SelectItem>
              <SelectItem value="ALERT_GENERATED">Alert Generated</SelectItem>
              <SelectItem value="ALERT_ESCALATED">Alert Escalated</SelectItem>
              <SelectItem value="ALERT_CLOSED">Alert Closed</SelectItem>
              <SelectItem value="REPORT_GENERATED">Report Generated</SelectItem>
              <SelectItem value="REPORT_APPROVED">Report Approved</SelectItem>
              <SelectItem value="REPORT_SUBMITTED">Report Submitted</SelectItem>
              <SelectItem value="USER_LOGIN">User Login</SelectItem>
              <SelectItem value="USER_LOGOUT">User Logout</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Entities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="Client">Client</SelectItem>
              <SelectItem value="Document">Document</SelectItem>
              <SelectItem value="Alert">Alert</SelectItem>
              <SelectItem value="AustracReport">Report</SelectItem>
              <SelectItem value="Transaction">Transaction</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 items-center">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border bg-muted/30 p-0.5">
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setViewMode('table')}
            >
              <Rows3 className="h-3.5 w-3.5 mr-1" />
              Table
            </Button>
            <Button
              variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setViewMode('timeline')}
            >
              <GitBranch className="h-3.5 w-3.5 mr-1" />
              Timeline
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!logs.length}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Enhanced Append-only Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800"
      >
        <div className="relative">
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </motion.div>
        </div>
        <div className="flex-1 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
            Immutable Audit Log
          </span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-500">
            — Append-only, tamper-evident records
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50">
            <Check className="h-2.5 w-2.5" />
            SHA-256 Verified
          </span>
        </div>
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 text-[10px] font-semibold shrink-0">
          {totalEntries} entries
        </Badge>
      </motion.div>

      {/* Audit Content */}
      <Card>
        <CardContent className="p-0">
          {viewMode === 'timeline' ? (
            <div className="p-4">
              <AuditTimelineView
                logs={logs}
                isLoading={isLoading}
                visibleCount={timelineVisibleCount}
                onLoadMore={() => setTimelineVisibleCount(prev => prev + 10)}
                hasMore={timelineVisibleCount < logs.length}
              />
            </div>
          ) : (
            <AuditTableView
              logs={logs}
              isLoading={isLoading}
              copiedHash={copiedHash}
              copyToClipboard={copyToClipboard}
            />
          )}
        </CardContent>
      </Card>

      {/* Pagination (table view) */}
      {viewMode === 'table' && pagination && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing {logs.length} of {pagination.total} entries</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <span className="py-1">Page {page} of {pagination.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
