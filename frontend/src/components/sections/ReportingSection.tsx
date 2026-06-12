'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClients, useAlerts, useGenerateReport, useUpdateReport, useReportsList } from '@/hooks/useApi';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FileText, Plus, Loader2, CheckCircle2, Clock, Send, Eye, CircleDot, Circle, User, AlertTriangle, DollarSign, Globe, ArrowLeftRight, Download, TrendingUp, TrendingDown, ArrowRight, ArrowLeft, ListOrdered, Server, ChevronDown, ChevronUp, Shield, Hash, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { toast } from 'sonner';

const REPORT_STEPS = [
  { key: 'draft', label: 'Draft', description: 'Report generated and saved', actor: 'System' },
  { key: 'pending_approval', label: 'Pending Approval', description: 'Awaiting compliance officer review', actor: 'Compliance Officer' },
  { key: 'approved', label: 'Approved', description: 'Report approved and ready for submission', actor: 'Senior Compliance' },
  { key: 'submitted', label: 'Submitted', description: 'Report submitted to AUSTRAC', actor: 'Reporting Team' },
];

// Report type configuration with colors and icons
const REPORT_TYPE_CONFIG: Record<string, { accent: string; accentBg: string; icon: typeof AlertTriangle; iconColor: string; borderClass: string; badgeClass: string }> = {
  SMR: {
    accent: '#ef4444',
    accentBg: 'bg-red-50 dark:bg-red-950/20',
    icon: AlertTriangle,
    iconColor: 'text-red-600 dark:text-red-400',
    borderClass: 'border-l-4 border-l-red-400 dark:border-l-red-600',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  },
  TTR: {
    accent: '#0ea5e9',
    accentBg: 'bg-sky-50 dark:bg-sky-950/20',
    icon: DollarSign,
    iconColor: 'text-sky-600 dark:text-sky-400',
    borderClass: 'border-l-4 border-l-sky-400 dark:border-l-sky-600',
    badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-sky-200 dark:border-sky-800',
  },
  'IFTI-E': {
    accent: '#f59e0b',
    accentBg: 'bg-amber-50 dark:bg-amber-950/20',
    icon: Globe,
    iconColor: 'text-amber-600 dark:text-amber-400',
    borderClass: 'border-l-4 border-l-amber-400 dark:border-l-amber-600',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  },
};

// Status badge config with colored backgrounds
const STATUS_BADGE_CONFIG: Record<string, { bg: string; text: string; icon: typeof Clock; pulse?: boolean }> = {
  draft: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', icon: FileText },
  pending_approval: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', icon: Clock, pulse: true },
  approved: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', icon: CheckCircle2 },
  submitted: { bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-400', icon: Send },
  acknowledged: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', icon: CheckCircle2 },
  failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: AlertTriangle },
};

function getReportTypeConfig(reportType: string) {
  return REPORT_TYPE_CONFIG[reportType] ?? REPORT_TYPE_CONFIG.SMR;
}

function getStatusBadge(status: string, austracReceiptId?: string) {
  const conf = STATUS_BADGE_CONFIG[status];
  if (!conf) {
    return (
      <Badge variant="outline" className="text-[10px]">{status}</Badge>
    );
  }
  const Icon = conf.icon;
  return (
    <div className="flex items-center gap-1.5">
      <Badge className={`text-[10px] h-5 gap-1 border-0 font-medium ${conf.bg} ${conf.text} ${conf.pulse ? 'animate-pulse' : ''}`}>
        <Icon className="h-3 w-3" />
        {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </Badge>
      {status === 'submitted' && austracReceiptId && (
        <Badge className="text-[9px] h-5 gap-1 border-0 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" title={`AUSTRAC Receipt: ${austracReceiptId}`}>
          <Shield className="h-3 w-3" />
          Receipt
        </Badge>
      )}
    </div>
  );
}

/** Simple regex-based XML syntax highlighter */
function highlightXML(xml: string): React.ReactNode {
  if (!xml) return <span className="text-muted-foreground">No payload available</span>;

  const parts: React.ReactNode[] = [];
  let key = 0;

  const regex = /(<!--[\s\S]*?-->)|(<\/?[\w:-]+)|(\/?>)|(\s[\w:-]+=)("|')([\s\S]*?)\5|([^<]+)/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(xml)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{xml.slice(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      parts.push(<span key={key++} className="text-muted-foreground/60 italic">{match[1]}</span>);
    } else if (match[2]) {
      const isClosing = match[2].startsWith('</');
      parts.push(
        <span key={key++}>
          <span className="text-muted-foreground/50">{isClosing ? '</' : '<'}</span>
          <span className="text-violet-600 dark:text-violet-400 font-medium">{match[2].slice(isClosing ? 2 : 1)}</span>
        </span>
      );
    } else if (match[3]) {
      parts.push(<span key={key++} className="text-muted-foreground/50">{match[3]}</span>);
    } else if (match[4]) {
      parts.push(<span key={key++} className="text-teal-600 dark:text-teal-400">{match[4]}</span>);
    } else if (match[5] && match[6] !== undefined) {
      parts.push(
        <span key={key++}>
          <span className="text-muted-foreground/50">{match[5]}</span>
          <span className="text-amber-600 dark:text-amber-400">{match[6]}</span>
          <span className="text-muted-foreground/50">{match[5]}</span>
        </span>
      );
    } else if (match[7]) {
      parts.push(<span key={key++} className="text-foreground/80">{match[7]}</span>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < xml.length) {
    parts.push(<span key={key++}>{xml.slice(lastIndex)}</span>);
  }

  return parts;
}

// CSV export helper
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Progress Tracker Pipeline Component */
function ProgressTracker({ reports }: { reports: Array<Record<string, unknown>> }) {
  const pipelineStages = useMemo(() => {
    return [
      {
        label: 'Draft',
        count: reports.filter(r => (r.status as string) === 'draft').length,
        color: 'slate' as const,
        icon: FileText,
        bgColor: 'bg-slate-100 dark:bg-slate-800',
        textColor: 'text-slate-600 dark:text-slate-400',
        activeBg: 'bg-slate-500',
        dotColor: 'bg-slate-400',
      },
      {
        label: 'Pending Approval',
        count: reports.filter(r => (r.status as string) === 'pending_approval').length,
        color: 'amber' as const,
        icon: Clock,
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
        textColor: 'text-amber-600 dark:text-amber-400',
        activeBg: 'bg-amber-500',
        dotColor: 'bg-amber-400',
      },
      {
        label: 'Approved',
        count: reports.filter(r => (r.status as string) === 'approved').length,
        color: 'emerald' as const,
        icon: CheckCircle2,
        bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
        textColor: 'text-emerald-600 dark:text-emerald-400',
        activeBg: 'bg-emerald-500',
        dotColor: 'bg-emerald-400',
      },
      {
        label: 'Submitted',
        count: reports.filter(r => (r.status as string) === 'submitted' || (r.submittedToAustrac as boolean) === true).length,
        color: 'sky' as const,
        icon: Send,
        bgColor: 'bg-sky-100 dark:bg-sky-900/30',
        textColor: 'text-sky-600 dark:text-sky-400',
        activeBg: 'bg-sky-500',
        dotColor: 'bg-sky-400',
      },
    ];
  }, [reports]);

  const hasReports = reports.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Submission Pipeline</span>
          </div>
          <div className="flex items-center justify-between gap-1">
            {pipelineStages.map((stage, idx) => {
              const Icon = stage.icon;
              const isActive = hasReports && stage.count > 0;
              return (
                <React.Fragment key={stage.label}>
                  <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                    <div className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 ${
                      isActive ? stage.bgColor : 'bg-muted/50'
                    }`}>
                      <Icon className={`h-5 w-5 ${isActive ? stage.textColor : 'text-muted-foreground/40'}`} />
                      {stage.count > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className={`absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-white px-1 ${stage.activeBg}`}
                        >
                          {stage.count}
                        </motion.span>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold text-center leading-tight ${
                      isActive ? stage.textColor : 'text-muted-foreground/50'
                    }`}>
                      {stage.label}
                    </span>
                  </div>
                  {idx < pipelineStages.length - 1 && (
                    <div className="flex items-center pt-[-16px] self-start mt-5 flex-shrink-0">
                      <div className={`w-6 sm:w-10 h-0.5 rounded-full transition-all duration-300 ${
                        isActive ? stage.dotColor : 'bg-muted-foreground/20'
                      }`} />
                      <ChevronRight className={`h-3 w-3 flex-shrink-0 ${isActive ? stage.textColor : 'text-muted-foreground/30'}`} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** ChevronRight icon - small inline component since it wasn't imported */
function ChevronRight({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ReportingSection() {
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportTypeFilter, setReportTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const { data: reportsData, isLoading: loadingReports } = useReportsList({ limit: 50 });

  const reports = (reportsData?.reports ?? []) as Array<Record<string, unknown>>;

  // Filter reports client-side
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (reportTypeFilter !== 'all' && (report.reportType as string) !== reportTypeFilter) return false;
      if (statusFilter !== 'all' && (report.status as string) !== statusFilter) return false;
      return true;
    });
  }, [reports, reportTypeFilter, statusFilter]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const total = reports.length;
    const pendingApproval = reports.filter(r => (r.status as string) === 'pending_approval').length;
    const approved = reports.filter(r => (r.status as string) === 'approved').length;
    const submitted = reports.filter(r => (r.status as string) === 'submitted' || (r.submittedToAustrac as boolean) === true).length;
    return { total, pendingApproval, approved, submitted };
  }, [reports]);

  // Report type counts for summary cards
  const reportTypeCounts = useMemo(() => {
    return {
      SMR: reports.filter(r => (r.reportType as string) === 'SMR').length,
      TTR: reports.filter(r => (r.reportType as string) === 'TTR').length,
      'IFTI-E': reports.filter(r => (r.reportType as string) === 'IFTI-E').length,
    };
  }, [reports]);

  // Toggle expanded row
  const toggleExpandedRow = useCallback((id: string) => {
    setExpandedRowId(prev => prev === id ? null : id);
  }, []);

  // CSV Export
  const exportCSV = () => {
    if (!filteredReports.length) return;
    const headers = ['Report ID', 'Type', 'Status', 'Created Date', 'Submission Date', 'Narrative Status', 'Client ID'];
    const rows = filteredReports.map((report) => [
      escapeCSV((report.reportId as string) ?? ''),
      escapeCSV((report.reportType as string) ?? ''),
      escapeCSV((report.status as string) ?? ''),
      escapeCSV(report.createdAt ? new Date(report.createdAt as string).toLocaleDateString('en-AU') : ''),
      escapeCSV(report.submissionDate ? new Date(report.submissionDate as string).toLocaleDateString('en-AU') : ''),
      escapeCSV(report.narrativeApproved ? 'Approved' : 'Pending'),
      escapeCSV((report.alertId as string) ?? ''),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reports-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredReports.length} reports to CSV`);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="AUSTRAC Reporting"
        description="SMR, TTR, and IFTI-E report management"
        icon={FileText}
        accentColor="#ef4444"
        breadcrumb={["Platform", "Reporting"]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filteredReports.length}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button onClick={() => setShowGenerate(true)} size="sm" className="relative overflow-hidden group">
              <span className="relative z-10 flex items-center">
                <Plus className="h-4 w-4 mr-1" /> Generate Report
              </span>
              <span className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            </Button>
          </div>
        }
      />

      {/* Report Type Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="relative overflow-hidden border-red-200/50 dark:border-red-800/30">
          <div className="absolute top-0 left-0 right-0 h-1 bg-red-400" />
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/30">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <span className="text-2xl font-bold metric-value text-red-700 dark:text-red-400">{reportTypeCounts.SMR}</span>
                </div>
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">SMR Reports</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Suspicious Matter Reports</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-emerald-200/50 dark:border-emerald-800/30">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-400" />
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/30">
                    <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-2xl font-bold metric-value text-emerald-700 dark:text-emerald-400">{reportTypeCounts.TTR}</span>
                </div>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">TTR Reports</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Threshold Transaction Reports</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-amber-200/50 dark:border-amber-800/30">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400" />
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/30">
                    <Globe className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-2xl font-bold metric-value text-amber-700 dark:text-amber-400">{reportTypeCounts['IFTI-E']}</span>
                </div>
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">IFTI-E Reports</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">International Fund Transfer Reports</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-400" />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800">
                <FileText className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground">Total Reports</span>
            </div>
            <div className="text-2xl font-bold metric-value">{summaryStats.total}</div>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              All time
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400" />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground">Pending Approval</span>
            </div>
            <div className="text-2xl font-bold metric-value text-amber-700 dark:text-amber-400">{summaryStats.pendingApproval}</div>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Awaiting review
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-400" />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground">Approved</span>
            </div>
            <div className="text-2xl font-bold metric-value text-emerald-700 dark:text-emerald-400">{summaryStats.approved}</div>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-3 w-3" />
              Ready to submit
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-sky-400" />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/30">
                <Send className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground">Submitted to AUSTRAC</span>
            </div>
            <div className="text-2xl font-bold metric-value text-sky-700 dark:text-sky-400">{summaryStats.submitted}</div>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-sky-600 dark:text-sky-400">
              <CheckCircle2 className="h-3 w-3" />
              Filed
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Tracker Pipeline */}
      <ProgressTracker reports={reports} />

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-3">
          <Select value={reportTypeFilter} onValueChange={setReportTypeFilter}>
            <SelectTrigger className="min-w-[160px]">
              <SelectValue placeholder="All Report Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Report Types</SelectItem>
              <SelectItem value="SMR">SMR</SelectItem>
              <SelectItem value="TTR">TTR</SelectItem>
              <SelectItem value="IFTI-E">IFTI-E</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="min-w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">
          Showing {filteredReports.length} of {reports.length} reports
        </div>
      </div>

      {/* Reports Table - Enhanced with color coding, animations, zebra striping, expandable rows */}
      <Card>
        <CardContent className="p-0">
          {loadingReports ? (
            <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
          ) : filteredReports.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No reports found</p>
              <p className="text-xs mt-1">
                {reportTypeFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Generate a report to get started'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 text-xs font-semibold text-muted-foreground w-8"></th>
                    <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Report ID</th>
                    <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Type</th>
                    <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Created</th>
                    <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Submitted</th>
                    <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Narrative</th>
                    <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filteredReports.map((report, index) => {
                      const typeConfig = getReportTypeConfig(report.reportType as string);
                      const TypeIcon = typeConfig.icon;
                      const isExpanded = expandedRowId === (report.id as string);
                      const isZebra = index % 2 === 1;
                      const currentStatus = (report.status as string) ?? 'draft';
                      const currentStepIdx = REPORT_STEPS.findIndex(s => s.key === currentStatus);
                      const narrativeDraft = (report.narrativeDraft as string) ?? '';

                      return (
                        <React.Fragment key={report.id as string}>
                          <motion.tr
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: index * 0.03 }}
                            className={`border-b hover:bg-muted/30 transition-all duration-150 group relative cursor-pointer ${
                              isZebra ? 'bg-muted/10' : ''
                            } ${typeConfig.borderClass}`}
                            onClick={() => toggleExpandedRow(report.id as string)}
                          >
                            {/* Expand toggle */}
                            <td className="p-3 w-8">
                              <motion.div
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="text-muted-foreground"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </motion.div>
                            </td>
                            <td className="p-3 font-mono text-xs">{(report.reportId as string)?.slice(-16)}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className={`p-1 rounded-md ${typeConfig.accentBg}`}>
                                  <TypeIcon className={`h-3.5 w-3.5 ${typeConfig.iconColor}`} />
                                </div>
                                <Badge variant="outline" className={`text-xs font-semibold ${typeConfig.badgeClass}`}>
                                  {report.reportType as string}
                                </Badge>
                              </div>
                            </td>
                            <td className="p-3">{getStatusBadge(currentStatus, report.austracReceiptId as string | undefined)}</td>
                            <td className="p-3 text-xs">{new Date(report.createdAt as string).toLocaleDateString('en-AU')}</td>
                            <td className="p-3 text-xs">
                              {report.submissionDate
                                ? new Date(report.submissionDate as string).toLocaleDateString('en-AU')
                                : '—'
                              }
                            </td>
                            <td className="p-3">
                              {report.narrativeApproved ? (
                                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> Approved</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedReportId(report.id as string); }}>
                                  <Eye className="h-3 w-3 mr-1" /> View
                                </Button>
                              </div>
                            </td>
                          </motion.tr>

                          {/* Expanded Detail Row */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.tr
                                key={`expanded-${report.id as string}`}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3 }}
                              >
                                <td colSpan={8} className="p-0">
                                  <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.25 }}
                                    className="px-6 py-4 bg-muted/20 border-b"
                                  >
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      {/* Narrative Preview */}
                                      <div className="md:col-span-2">
                                        <NarrativePreview narrative={narrativeDraft} narrativeApproved={report.narrativeApproved as boolean} />
                                      </div>

                                      {/* Status Mini-Timeline */}
                                      <div>
                                        <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Report Lifecycle</h5>
                                        <MiniTimeline currentStepIdx={currentStepIdx} createdAt={report.createdAt as string} />
                                      </div>
                                    </div>

                                    {/* Data Hash & Actions Row */}
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-4 pt-3 border-t border-border/50 gap-3">
                                      <div className="flex items-center gap-4">
                                        {report.dataHash && (
                                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                            <Hash className="h-3 w-3" />
                                            <span className="font-mono">{(report.dataHash as string).slice(0, 20)}...</span>
                                            <Badge className="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 text-[9px] h-4 border-0 gap-0.5">
                                              <Shield className="h-2.5 w-2.5" /> Verified
                                            </Badge>
                                          </div>
                                        )}
                                        {report.austracReceiptId && (
                                          <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                                            <Shield className="h-3 w-3" />
                                            <span>AUSTRAC Receipt: </span>
                                            <span className="font-mono font-semibold">{report.austracReceiptId as string}</span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex gap-2">
                                        {(currentStatus === 'draft' || currentStatus === 'pending_approval') && (
                                          <ExpandableActionButton
                                            label="Edit Narrative"
                                            icon={FileText}
                                            variant="outline"
                                            onClick={() => setSelectedReportId(report.id as string)}
                                          />
                                        )}
                                        {(currentStatus === 'draft' || currentStatus === 'pending_approval') && (
                                          <ExpandableActionButton
                                            label="Approve"
                                            icon={CheckCircle2}
                                            variant="default"
                                            onClick={() => setSelectedReportId(report.id as string)}
                                          />
                                        )}
                                        {currentStatus === 'approved' && (
                                          <ExpandableActionButton
                                            label="Submit to AUSTRAC"
                                            icon={Send}
                                            variant="default"
                                            onClick={() => setSelectedReportId(report.id as string)}
                                          />
                                        )}
                                      </div>
                                    </div>
                                  </motion.div>
                                </td>
                              </motion.tr>
                            )}
                          </AnimatePresence>
                        </React.Fragment>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Report Dialog - Wizard */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate AUSTRAC Report</DialogTitle>
          </DialogHeader>
          <GenerateReportWizard onClose={() => setShowGenerate(false)} />
        </DialogContent>
      </Dialog>

      {/* Report Queue Status */}
      <ReportQueueStatus reports={reports} />

      {/* Report Detail Dialog */}
      <Dialog open={!!selectedReportId} onOpenChange={() => setSelectedReportId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Report Detail</DialogTitle>
          </DialogHeader>
          {selectedReportId && <ReportDetail reportId={selectedReportId} reports={reports} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Action button for expandable row */
function ExpandableActionButton({
  label,
  icon: Icon,
  variant,
  onClick,
}: {
  label: string;
  icon: typeof FileText;
  variant: 'default' | 'outline';
  onClick: () => void;
}) {
  return (
    <Button
      variant={variant}
      size="sm"
      className="h-7 text-xs gap-1"
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

/** Narrative Preview with read more/less */
function NarrativePreview({ narrative, narrativeApproved }: { narrative: string; narrativeApproved: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_LENGTH = 200;

  if (!narrative) {
    return (
      <div>
        <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Narrative Preview</h5>
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
          <FileText className="h-5 w-5 mx-auto mb-1 text-muted-foreground/30" />
          <p className="text-[10px] text-muted-foreground">No narrative drafted yet</p>
        </div>
      </div>
    );
  }

  const isTruncated = narrative.length > PREVIEW_LENGTH;
  const displayText = expanded ? narrative : narrative.slice(0, PREVIEW_LENGTH);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Narrative Preview</h5>
        {narrativeApproved ? (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[9px] h-4 border-0">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Approved
          </Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[9px] h-4 border-0">
            <Clock className="h-2.5 w-2.5 mr-0.5" /> Draft
          </Badge>
        )}
      </div>
      <div className="p-3 rounded-lg bg-background border border-border/50 text-xs leading-relaxed">
        <p className="whitespace-pre-wrap">{displayText}{isTruncated && !expanded ? '...' : ''}</p>
        {isTruncated && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-primary hover:underline text-[10px] font-semibold mt-1 inline-block"
          >
            {expanded ? 'Read less' : 'Read more'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Mini Timeline for expanded row */
function MiniTimeline({ currentStepIdx, createdAt }: { currentStepIdx: number; createdAt: string }) {
  const createdDate = new Date(createdAt);

  return (
    <div className="space-y-0">
      {REPORT_STEPS.map((step, idx) => {
        const isCompleted = idx <= currentStepIdx;
        const isCurrent = idx === currentStepIdx;
        const stepDate = new Date(createdDate.getTime() + idx * 3600000);

        return (
          <div key={step.key} className="flex items-start gap-2 relative">
            {/* Vertical line */}
            {idx < REPORT_STEPS.length - 1 && (
              <div
                className={`absolute left-[7px] top-[18px] w-0.5 h-[20px] ${
                  idx < currentStepIdx ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-muted-foreground/20'
                }`}
              />
            )}
            {/* Dot */}
            <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center ${
              idx < currentStepIdx
                ? 'bg-emerald-500 border-emerald-500'
                : idx === currentStepIdx
                ? 'bg-amber-400 border-amber-400'
                : 'bg-background border-muted-foreground/30'
            }`}>
              {idx < currentStepIdx && (
                <CheckCircle2 className="h-2.5 w-2.5 text-white" />
              )}
            </div>
            {/* Label */}
            <div className="flex-1 min-w-0 pb-3">
              <div className={`text-[11px] font-medium ${
                isCurrent ? 'text-amber-700 dark:text-amber-400' : isCompleted ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/50'
              }`}>
                {step.label}
              </div>
              {isCompleted && (
                <div className="text-[9px] text-muted-foreground">
                  {stepDate.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })} · {step.actor}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Report Generation Wizard - Step-by-step */
function GenerateReportWizard({ onClose }: { onClose: () => void }) {
  const { data: alertsData } = useAlerts({ limit: 20 });
  const { data: clientsData } = useClients({ limit: 50 });
  const generateReport = useGenerateReport();

  const [step, setStep] = useState(1);
  const [reportType, setReportType] = useState('');
  const [alertId, setAlertId] = useState('');
  const [clientId, setClientId] = useState('');

  const alerts = (alertsData?.alerts ?? []) as Array<Record<string, unknown>>;
  const clients = (clientsData?.clients ?? []) as Array<Record<string, unknown>>;

  const selectedAlert = alerts.find((a: Record<string, unknown>) => a.id === alertId);
  const selectedClient = clients.find((c: Record<string, unknown>) => c.id === clientId);

  const totalSteps = 3;
  const canProceed = step === 1 ? !!reportType : step === 2 ? true : true;

  const handleGenerate = async () => {
    try {
      const data: Record<string, unknown> = {};
      if (reportType === 'SMR') {
        if (alertId) data.alertId = alertId;
        if (clientId) data.clientId = clientId;
      } else if (reportType === 'TTR' || reportType === 'IFTI-E') {
        data.transactionIds = ['placeholder-txn-id'];
      }

      await generateReport.mutateAsync({ type: reportType, data });
      toast.success(`${reportType} report generated successfully`);
      onClose();
    } catch {
      toast.error('Failed to generate report');
    }
  };

  const typeConfig = reportType ? getReportTypeConfig(reportType) : null;
  const TypeIcon = typeConfig?.icon ?? AlertTriangle;

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                s < step
                  ? 'bg-emerald-500 text-white'
                  : s === step
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            {s < 3 && (
              <div className={`flex-1 h-0.5 rounded-full transition-all duration-300 ${
                s < step ? 'bg-emerald-500' : 'bg-muted'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground -mt-2 mb-4">
        <span className={step === 1 ? 'text-primary font-semibold' : ''}>Report Type</span>
        <span className={step === 2 ? 'text-primary font-semibold' : ''}>Association</span>
        <span className={step === 3 ? 'text-primary font-semibold' : ''}>Review</span>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Report Type</label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { type: 'SMR', label: 'Suspicious Matter Report', desc: 'Report suspicious activity, transactions, or behaviour', icon: AlertTriangle, color: 'red' },
                { type: 'TTR', label: 'Threshold Transaction Report', desc: 'Report cash transactions of $10,000 or more', icon: DollarSign, color: 'sky' },
                { type: 'IFTI-E', label: 'International Funds Transfer Instruction', desc: 'Report international wire transfers to/from AU', icon: Globe, color: 'amber' },
              ].map((rt) => {
                const isSelected = reportType === rt.type;
                const rtConfig = getReportTypeConfig(rt.type);
                const RtIcon = rt.icon;
                return (
                  <button
                    key={rt.type}
                    onClick={() => setReportType(rt.type)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all duration-200 ${
                      isSelected
                        ? `border-current ${rtConfig.accentBg} ${rtConfig.iconColor}`
                        : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-md ${isSelected ? rtConfig.accentBg : 'bg-muted/50'}`}>
                        <RtIcon className={`h-5 w-5 ${isSelected ? rtConfig.iconColor : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className={`text-sm font-semibold ${isSelected ? rtConfig.iconColor : 'text-foreground'}`}>
                          {rt.type} — {rt.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{rt.desc}</div>
                      </div>
                      {isSelected && <CheckCircle2 className={`h-5 w-5 ml-auto ${rtConfig.iconColor}`} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Associate Alert / Client</label>
            {reportType === 'SMR' ? (
              <>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground mb-1.5 block">Link to Alert (optional)</label>
                  <Select value={alertId} onValueChange={setAlertId}>
                    <SelectTrigger><SelectValue placeholder="Select an alert to associate..." /></SelectTrigger>
                    <SelectContent>
                      {alerts.map((a: Record<string, unknown>) => (
                        <SelectItem key={a.id as string} value={a.id as string}>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px]">{(a.alertId as string)?.slice(-12)}</span>
                            <span className="text-muted-foreground">—</span>
                            <span>{(a.alertType as string)?.replace(/_/g, ' ')}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground mb-1.5 block">Link to Client (optional)</label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger><SelectValue placeholder="Select a client to associate..." /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c: Record<string, unknown>) => (
                        <SelectItem key={c.id as string} value={c.id as string}>
                          {c.fullName as string}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
                <DollarSign className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  {reportType === 'TTR'
                    ? 'TTR reports are automatically generated when threshold transactions are detected.'
                    : 'IFTI-E reports are automatically generated for international fund transfers.'
                  }
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">No manual association needed.</p>
              </div>
            )}
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Review & Confirm</label>
            <div className="p-4 rounded-lg border border-border/80 bg-muted/20 space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b border-border/50">
                {typeConfig && (
                  <div className={`p-2 rounded-md ${typeConfig.accentBg}`}>
                    <TypeIcon className={`h-5 w-5 ${typeConfig.iconColor}`} />
                  </div>
                )}
                <div>
                  <div className="text-sm font-semibold">{reportType} Report</div>
                  <div className="text-[10px] text-muted-foreground">
                    {reportType === 'SMR' ? 'Suspicious Matter Report' : reportType === 'TTR' ? 'Threshold Transaction Report' : 'International Funds Transfer Instruction'}
                  </div>
                </div>
              </div>
              {reportType === 'SMR' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Linked Alert</span>
                    <span className="font-medium">{selectedAlert ? (selectedAlert.alertId as string)?.slice(-12) : 'None'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Linked Client</span>
                    <span className="font-medium">{selectedClient ? (selectedClient.fullName as string) : 'None'}</span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Generated By</span>
                <span className="font-medium">Compliance Officer</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Initial Status</span>
                <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px] border-0">Draft</Badge>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
              <div className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                <AlertTriangle className="h-3 w-3" />
                This report will be created in Draft status and require compliance officer approval before submission to AUSTRAC.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation buttons */}
      <div className="flex gap-2 pt-2 border-t border-border/50">
        {step > 1 && (
          <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        )}
        <div className="flex-1" />
        {step < totalSteps ? (
          <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed} className="gap-1">
            Next <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button onClick={handleGenerate} disabled={generateReport.isPending} className="gap-1 relative overflow-hidden group">
            {generateReport.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Generating...
              </>
            ) : (
              <>
                <span className="relative z-10 flex items-center">
                  <Send className="h-4 w-4 mr-1" /> Generate Report
                </span>
                <span className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              </>
            )}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

/** Report Queue Status Card */
function ReportQueueStatus({ reports }: { reports: Array<Record<string, unknown>> }) {
  // Mock queue data for the generation queue
  const queueItems = useMemo(() => {
    const pending = reports
      .filter((r) => (r.status as string) === 'draft')
      .slice(0, 3)
      .map((r, idx) => ({
        id: r.id as string,
        reportId: (r.reportId as string)?.slice(-12) ?? 'N/A',
        type: r.reportType as string,
        position: idx + 1,
        estimatedTime: `${(idx + 1) * 2} min`,
        status: 'queued' as const,
      }));

    const recent = reports
      .filter((r) => ['submitted', 'approved'].includes(r.status as string))
      .slice(0, 5)
      .map((r) => ({
        id: r.id as string,
        reportId: (r.reportId as string)?.slice(-12) ?? 'N/A',
        type: r.reportType as string,
        completedAt: new Date(r.createdAt as string).toLocaleString('en-AU', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        }),
        status: (r.status as string) === 'submitted' ? 'submitted' as const : 'approved' as const,
      }));

    return { pending, recent };
  }, [reports]);

  if (queueItems.pending.length === 0 && queueItems.recent.length === 0) {
    return null;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
      <Card className="border-border/80 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-slate-400 via-sky-400 to-emerald-400" />
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Report Queue</span>
            </div>
            {queueItems.pending.length > 0 && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                {queueItems.pending.length} Pending
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pending Queue */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Generation Queue</span>
              </div>
              {queueItems.pending.length === 0 ? (
                <div className="p-3 rounded-lg bg-muted/20 text-center">
                  <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
                  <p className="text-[10px] text-muted-foreground">Queue empty — all reports processed</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {queueItems.pending.map((item) => {
                    const config = getReportTypeConfig(item.type);
                    return (
                      <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/30 dark:border-amber-800/20">
                        <div className={`p-1 rounded ${config.accentBg}`}>
                          <Server className={`h-3 w-3 ${config.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold">{item.type} — {item.reportId}</div>
                          <div className="text-[9px] text-muted-foreground">Position: #{item.position} · Est. {item.estimatedTime}</div>
                        </div>
                        <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Completions */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recent Completions</span>
              </div>
              {queueItems.recent.length === 0 ? (
                <div className="p-3 rounded-lg bg-muted/20 text-center">
                  <p className="text-[10px] text-muted-foreground">No recent completions</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {queueItems.recent.map((item) => {
                    const config = getReportTypeConfig(item.type);
                    return (
                      <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/30 dark:bg-emerald-950/10 border border-emerald-200/20 dark:border-emerald-800/15">
                        <div className={`p-1 rounded ${config.accentBg}`}>
                          <CheckCircle2 className={`h-3 w-3 ${item.status === 'submitted' ? 'text-sky-600 dark:text-sky-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold">{item.type} — {item.reportId}</div>
                          <div className="text-[9px] text-muted-foreground">{item.completedAt}</div>
                        </div>
                        <Badge className={`text-[8px] border-0 ${
                          item.status === 'submitted'
                            ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        }`}>
                          {item.status === 'submitted' ? 'Filed' : 'Ready'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function GenerateReportForm({ onClose }: { onClose: () => void }) {
  const { data: alertsData } = useAlerts({ limit: 20 });
  const { data: clientsData } = useClients({ limit: 50 });
  const generateReport = useGenerateReport();

  const [reportType, setReportType] = useState('SMR');
  const [alertId, setAlertId] = useState('');
  const [clientId, setClientId] = useState('');

  const alerts = (alertsData?.alerts ?? []) as Array<Record<string, unknown>>;
  const clients = (clientsData?.clients ?? []) as Array<Record<string, unknown>>;

  const handleGenerate = async () => {
    try {
      const data: Record<string, unknown> = {};
      if (reportType === 'SMR') {
        if (alertId) data.alertId = alertId;
        if (clientId) data.clientId = clientId;
      } else if (reportType === 'TTR' || reportType === 'IFTI-E') {
        data.transactionIds = ['placeholder-txn-id'];
      }

      await generateReport.mutateAsync({ type: reportType, data });
      toast.success(`${reportType} report generated`);
      onClose();
    } catch {
      toast.error('Failed to generate report');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Report Type</label>
        <Select value={reportType} onValueChange={setReportType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="SMR">SMR - Suspicious Matter Report</SelectItem>
            <SelectItem value="TTR">TTR - Threshold Transaction Report</SelectItem>
            <SelectItem value="IFTI-E">IFTI-E - International Funds Transfer Instruction</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {reportType === 'SMR' && (
        <>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Link to Alert (optional)</label>
            <Select value={alertId} onValueChange={setAlertId}>
              <SelectTrigger><SelectValue placeholder="Select alert..." /></SelectTrigger>
              <SelectContent>
                {alerts.map((a: Record<string, unknown>) => (
                  <SelectItem key={a.id as string} value={a.id as string}>
                    {(a.alertId as string)?.slice(-12)} - {(a.alertType as string)?.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Link to Client (optional)</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
              <SelectContent>
                {clients.map((c: Record<string, unknown>) => (
                  <SelectItem key={c.id as string} value={c.id as string}>
                    {c.fullName as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button onClick={handleGenerate} disabled={generateReport.isPending} className="flex-1">
          {generateReport.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Generate
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

function ReportDetail({ reportId, reports }: { reportId: string; reports: Array<Record<string, unknown>> }) {
  const report = reports.find(r => r.id === reportId);
  const updateReport = useUpdateReport();
  const [narrative, setNarrative] = useState((report?.narrativeDraft as string) ?? '');
  const [showCompare, setShowCompare] = useState(false);

  const typeConfig = getReportTypeConfig(report?.reportType as string ?? 'SMR');
  const TypeIcon = typeConfig.icon;

  // Find previous report of same type for comparison
  const reportIndex = reports.findIndex(r => r.id === reportId);
  const previousReport = useMemo(() => {
    for (let i = reportIndex + 1; i < reports.length; i++) {
      if (reports[i].reportType === report?.reportType) {
        return reports[i];
      }
    }
    return null;
  }, [reports, reportIndex, report?.reportType]);

  if (!report) {
    return <div className="p-4 text-center text-muted-foreground">Report not found</div>;
  }

  const handleApprove = async () => {
    try {
      await updateReport.mutateAsync({ id: report.id as string, data: { action: 'approve', approvedBy: 'compliance_officer' } });
      toast.success('Report approved');
    } catch {
      toast.error('Failed to approve report');
    }
  };

  const handleSubmit = async () => {
    try {
      await updateReport.mutateAsync({ id: report.id as string, data: { action: 'submit' } });
      toast.success('Report submitted to AUSTRAC');
    } catch {
      toast.error('Failed to submit report');
    }
  };

  const currentStatus = report.status as string;
  const currentStepIdx = REPORT_STEPS.findIndex(s => s.key === currentStatus);

  const xmlPayload = (report.xmlPayload as string) ?? '';

  return (
    <ScrollArea className="max-h-[65vh]">
      <div className="space-y-6">
        {/* Report Info - Enhanced with type badge */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Report ID:</span> <span className="font-mono text-xs">{report.reportId as string}</span></div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Type:</span>
            <div className="flex items-center gap-1.5">
              <div className={`p-1 rounded-md ${typeConfig.accentBg}`}>
                <TypeIcon className={`h-3.5 w-3.5 ${typeConfig.iconColor}`} />
              </div>
              <Badge variant="outline" className={`text-xs font-semibold ${typeConfig.badgeClass}`}>{report.reportType as string}</Badge>
            </div>
          </div>
          <div><span className="text-muted-foreground">Status:</span> {getStatusBadge((report.status as string) ?? 'draft', report.austracReceiptId as string | undefined)}</div>
          <div><span className="text-muted-foreground">Created:</span> {new Date(report.createdAt as string).toLocaleDateString('en-AU')}</div>
          {report.austracReceiptId && (
            <div><span className="text-muted-foreground">AUSTRAC Receipt:</span> <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{report.austracReceiptId as string}</span></div>
          )}
          {report.dataHash && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Data Hash:</span>
              <span className="font-mono text-[10px]">{(report.dataHash as string).slice(0, 16)}...</span>
              <Badge className="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 text-[9px] h-4 border-0 gap-0.5">
                <Shield className="h-2.5 w-2.5" /> Verified
              </Badge>
            </div>
          )}
        </div>

        {/* Vertical Timeline - Enhanced with connecting dots */}
        <div>
          <h4 className="text-sm font-semibold mb-4">Report Status Timeline</h4>
          <div className="relative pl-6">
            {REPORT_STEPS.map((step, idx) => {
              const isCompleted = idx <= currentStepIdx;
              const isCurrent = idx === currentStepIdx;

              const createdDate = new Date(report.createdAt as string);
              const stepDate = new Date(createdDate.getTime() + idx * 3600000);
              const formattedDate = isCompleted
                ? stepDate.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) +
                  ' ' + stepDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
                : null;

              return (
                <div key={step.key} className="relative pb-6 last:pb-0">
                  {idx < REPORT_STEPS.length - 1 && (
                    <div
                      className={`absolute left-[-20px] top-[20px] w-0.5 h-[calc(100%-12px)] ${
                        idx < currentStepIdx ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-muted'
                      }`}
                    />
                  )}

                  <div className={`absolute left-[-23px] top-[16px] w-[10px] h-[10px] rounded-full border-2 ${
                    idx < currentStepIdx
                      ? 'bg-emerald-500 border-emerald-500'
                      : idx === currentStepIdx
                      ? 'bg-primary border-primary'
                      : 'bg-muted border-muted-foreground/30'
                  }`} />

                  <div className={`absolute left-[-24px] top-[4px] hidden`}>
                    {isCompleted && !isCurrent ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : isCurrent ? (
                      <CircleDot className="h-5 w-5 text-primary" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground/40" />
                    )}
                  </div>

                  <div className={`flex-1 p-3 rounded-lg border transition-all duration-300 ${
                    isCurrent
                      ? 'bg-primary/5 border-primary/30 shadow-sm'
                      : isCompleted
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                      : 'bg-muted/20 border-transparent'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${
                          isCurrent ? 'text-primary' : isCompleted ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                        }`}>
                          {step.label}
                        </span>
                        {isCurrent && (
                          <Badge className="bg-primary/10 text-primary text-[10px]">Current</Badge>
                        )}
                        {isCompleted && !isCurrent && (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">Completed</Badge>
                        )}
                      </div>
                    </div>
                    <p className={`text-[11px] mt-0.5 ${isCompleted ? 'text-foreground/80' : 'text-muted-foreground'}`}>
                      {step.description}
                    </p>
                    {formattedDate && (
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {formattedDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /> {step.actor}
                        </span>
                      </div>
                    )}
                    {!isCompleted && (
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /> {step.actor}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* XML Payload - Enhanced with syntax highlighting */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">XML Payload</h4>
          <div className="text-[10px] overflow-auto max-h-40 bg-muted/30 rounded-lg p-3 font-mono border border-border/50">
            {highlightXML(xmlPayload)}
          </div>
        </div>

        {/* Narrative (SMR) - Enhanced with compare view */}
        {(report.reportType === 'SMR' || report.narrativeDraft) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground">SMR Narrative</h4>
              {previousReport && (previousReport.narrativeDraft || previousReport.narrativeApproved) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={() => setShowCompare(!showCompare)}
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  {showCompare ? 'Hide' : 'Compare with previous'}
                </Button>
              )}
            </div>
            {showCompare && previousReport ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary" /> Current
                  </div>
                  <Textarea
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    className="min-h-[120px] text-xs"
                    placeholder="Enter or edit SMR narrative..."
                  />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Previous ({(previousReport.reportId as string)?.slice(-8)})
                  </div>
                  <div className="min-h-[120px] text-xs p-3 rounded-md border bg-muted/10 text-muted-foreground">
                    {(previousReport.narrativeDraft as string) ?? (previousReport.narrativeApproved as string) ?? 'No narrative available'}
                  </div>
                </div>
              </div>
            ) : (
              <Textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                className="min-h-[120px] text-xs"
                placeholder="Enter or edit SMR narrative..."
              />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {(report.status === 'draft' || report.status === 'pending_approval') && (
            <Button size="sm" onClick={handleApprove} disabled={updateReport.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
            </Button>
          )}
          {report.status === 'approved' && (
            <Button size="sm" onClick={handleSubmit} disabled={updateReport.isPending}>
              <Send className="h-4 w-4 mr-1" /> Submit to AUSTRAC
            </Button>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
