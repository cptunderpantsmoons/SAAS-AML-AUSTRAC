'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Shield, Search, Globe, AlertTriangle, CheckCircle2,
  XCircle, Clock, Eye, ChevronDown, ChevronUp, RefreshCw,
  ShieldAlert, ShieldCheck, ShieldOff, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  useClients,
  useAlerts,
  useSanctionsSources,
  useSanctionsMatches,
  useScreenName,
  useUpdateSanctionsMatch,
  type SanctionsSource,
  type SanctionsMatch,
} from '@/hooks/useApi';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { toast } from 'sonner';

interface SanctionsScreeningPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type MatchType = 'Exact' | 'Partial' | 'Fuzzy';
type ScreeningStatus = 'Pending Review' | 'Confirmed Match' | 'False Positive' | 'Cleared';

function getConfidenceColor(confidence: number): string {
  if (confidence > 80) return 'text-red-600 dark:text-red-400';
  if (confidence >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function getConfidenceBg(confidence: number): string {
  if (confidence > 80) return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
  if (confidence >= 50) return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
  return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800';
}

function getConfidenceBarColor(confidence: number): string {
  if (confidence > 80) return 'bg-red-500';
  if (confidence >= 50) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getStatusConfig(status: ScreeningStatus): { icon: React.ElementType; className: string; label: string } {
  switch (status) {
    case 'Pending Review':
      return { icon: Clock, className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800', label: 'Pending Review' };
    case 'Confirmed Match':
      return { icon: ShieldAlert, className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800', label: 'Confirmed Match' };
    case 'False Positive':
      return { icon: ShieldOff, className: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', label: 'False Positive' };
    case 'Cleared':
      return { icon: ShieldCheck, className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800', label: 'Cleared' };
  }
}

function getMatchTypeConfig(type: MatchType): { className: string } {
  switch (type) {
    case 'Exact':
      return { className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
    case 'Partial':
      return { className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' };
    case 'Fuzzy':
      return { className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400' };
  }
}

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
  return `${diffDays}d ago`;
}

export function SanctionsScreeningPanel({ isOpen, onClose }: SanctionsScreeningPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [activeMatches, setActiveMatches] = useState<SanctionsMatch[]>([]);
  const [hasScreened, setHasScreened] = useState(false);

  // Real backend data
  const { data: clientsData } = useClients({ limit: 10 });
  const { data: alertsData } = useAlerts({ limit: 5, alertType: 'sanctions_screening' });
  const { data: sources = [] } = useSanctionsSources();
  const { data: matchesData } = useSanctionsMatches({ pageSize: 100 });
  const screenMutation = useScreenName();
  const updateMatchMutation = useUpdateSanctionsMatch();

  const persistedMatches = (matchesData?.matches ?? []) as SanctionsMatch[];

  const clientNames = useMemo(() => {
    const clients = (clientsData?.clients ?? []) as Array<Record<string, unknown>>;
    return clients.map(c => (c.fullName as string) ?? (c.businessName as string) ?? '').filter(Boolean);
  }, [clientsData?.clients]);

  // Display the user's freshly-screened matches, falling back to the
  // persisted history.  This way the operator sees immediate feedback
  // after running a query but the historical list is not wiped between
  // sessions.
  const displayMatches = hasScreened ? activeMatches : persistedMatches;

  // The "Refresh" button should re-screen against the current query.
  useEffect(() => {
    if (!hasScreened) return;
    setActiveMatches(persistedMatches);
  }, [persistedMatches, hasScreened]);

  const filteredMatches = useMemo(() => {
    if (!searchQuery.trim()) return displayMatches;
    const query = searchQuery.toLowerCase();
    return displayMatches.filter(
      m => m.clientName.toLowerCase().includes(query) ||
        m.listedEntity.toLowerCase().includes(query) ||
        m.source.toLowerCase().includes(query) ||
        m.program.toLowerCase().includes(query)
    );
  }, [displayMatches, searchQuery]);

  const summaryStats = useMemo(() => {
    const total = displayMatches.length;
    const pending = displayMatches.filter(m => m.status === 'Pending Review').length;
    const confirmed = displayMatches.filter(m => m.status === 'Confirmed Match').length;
    const falsePositives = displayMatches.filter(m => m.status === 'False Positive').length;
    const cleared = displayMatches.filter(m => m.status === 'Cleared').length;
    const highConfidence = displayMatches.filter(m => m.confidence > 80).length;
    return { total, pending, confirmed, falsePositives, cleared, highConfidence };
  }, [displayMatches]);

  const handleScreen = () => {
    const query = searchQuery.trim();
    if (!query) {
      toast.error('Enter a name or entity to screen');
      return;
    }
    screenMutation.mutate(
      { query, clientName: query },
      {
        onSuccess: (matches) => {
          setActiveMatches(matches);
          setHasScreened(true);
        },
        onError: (err) => {
          toast.error(`Screen failed: ${err instanceof Error ? err.message : 'unknown error'}`);
        },
      },
    );
  };

  const handleStatusChange = (matchId: string, newStatus: ScreeningStatus) => {
    updateMatchMutation.mutate(
      { id: matchId, status: newStatus },
      {
        onSuccess: () => {
          setActiveMatches((prev) => prev.map((m) => m.id === matchId ? { ...m, status: newStatus } : m));
        },
        onError: (err) => {
          toast.error(`Update failed: ${err instanceof Error ? err.message : 'unknown error'}`);
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScreen();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 h-full w-full sm:w-[480px] bg-background border-l border-border shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/20">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-200 dark:shadow-amber-900/50">
                    <Shield className="h-5 w-5 text-white" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-emerald-500 rounded-full ring-2 ring-background" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">Sanctions Screening</h2>
                  <p className="text-xs text-muted-foreground">Configure sources in Settings</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[9px] h-5 px-1.5 ${
                    summaryStats.total === 0
                      ? 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/30'
                      : 'border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
                  }`}
                >
                  {summaryStats.total === 0 ? 'NO DATA' : `${summaryStats.total} MATCHES`}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-white/60 dark:hover:bg-background/60"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Screening Sources */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Screening Sources</p>
                  <div className="grid grid-cols-2 gap-2">
                    {sources.length === 0 ? (
                      <div className="col-span-2 text-center py-6">
                        <div className="h-12 w-12 rounded-xl bg-muted/30 mx-auto flex items-center justify-center mb-3">
                          <Shield className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">No sanctions sources configured</p>
                        <p className="text-xs text-muted-foreground mt-1">Add data sources in Settings to begin screening</p>
                      </div>
                    ) : (
                      sources.map((source: SanctionsSource, idx: number) => (
                        <motion.div
                          key={source.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05, duration: 0.25 }}
                        >
                          <Card className="border border-border hover:shadow-sm transition-shadow">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-base">🛡️</span>
                                <span className="text-xs font-semibold truncate">{source.name}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mb-1.5">
                                {source.entriesIndexed.toLocaleString()} indexed entries
                              </p>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-muted-foreground">
                                  <Clock className="h-2.5 w-2.5 inline mr-0.5" />
                                  {source.lastCheck ? new Date(source.lastCheck).toLocaleDateString() : 'never'}
                                </span>
                                <Badge variant="outline" className="text-[8px] h-4 px-1 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30">
                                  {source.enabled ? 'LIVE' : 'OFFLINE'}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>

                <Separator />

                {/* Client Search Input */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Client Screening</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter client name to screen..."
                        className="pl-9 h-10 text-sm"
                      />
                    </div>
                    <Button
                      className="h-10 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-200 dark:shadow-amber-900/50 transition-all duration-200 shrink-0"
                      onClick={handleScreen}
                      disabled={screenMutation.isPending}
                    >
                      {screenMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Shield className="h-4 w-4 mr-1.5" />
                      )}
                      Screen
                    </Button>
                  </div>
                </div>

                {/* Summary Stats Row */}
                <div className="grid grid-cols-4 gap-2">
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-border"
                  >
                    <p className="text-lg font-bold text-foreground">{summaryStats.total}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Screened</p>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30"
                  >
                    <p className="text-lg font-bold text-red-600 dark:text-red-400">{summaryStats.confirmed}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Matches</p>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-border"
                  >
                    <p className="text-lg font-bold text-slate-600 dark:text-slate-400">{summaryStats.falsePositives}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">False Pos.</p>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="text-center p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30"
                  >
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{summaryStats.pending}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Pending</p>
                  </motion.div>
                </div>

                <Separator />

                {/* Screening Results Table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Screening Results
                    </p>
                    {filteredMatches.length !== displayMatches.length && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                        {filteredMatches.length} of {displayMatches.length}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    {filteredMatches.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="h-12 w-12 rounded-xl bg-muted/30 mx-auto flex items-center justify-center mb-3">
                          <Search className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">No matches found</p>
                        <p className="text-xs text-muted-foreground mt-1">Try a different search term or clear filters</p>
                      </div>
                    ) : (
                      filteredMatches.map((match, idx) => {
                        const statusConfig = getStatusConfig(match.status);
                        const matchTypeConfig = getMatchTypeConfig(match.matchType);
                        const isExpanded = expandedMatch === match.id;
                        const StatusIcon = statusConfig.icon;

                        return (
                          <motion.div
                            key={match.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.03, duration: 0.2 }}
                          >
                            <Card className={`border overflow-hidden transition-all duration-200 hover:shadow-md ${
                              match.confidence > 80
                                ? 'border-red-200 dark:border-red-900/50'
                                : match.confidence >= 50
                                  ? 'border-amber-200 dark:border-amber-900/50'
                                  : 'border-border'
                            }`}>
                              <CardContent className="p-0">
                                {/* Main row */}
                                <div
                                  className="p-3 cursor-pointer"
                                  onClick={() => setExpandedMatch(isExpanded ? null : match.id)}
                                >
                                  <div className="flex items-start gap-2">
                                    {/* Confidence indicator */}
                                    <div className={`shrink-0 mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold border ${getConfidenceBg(match.confidence)} ${getConfidenceColor(match.confidence)}`}>
                                      {match.confidence}%
                                    </div>

                                    {/* Main content */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-sm font-semibold truncate">{match.clientName}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <Badge variant="outline" className={`${matchTypeConfig.className} text-[9px] h-4 px-1 font-medium border-0`}>
                                          {match.matchType}
                                        </Badge>
                                        <Badge variant="outline" className={`${statusConfig.className} text-[9px] h-4 px-1 font-medium`}>
                                          <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                                          {statusConfig.label}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground">
                                          {match.source}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Expand toggle */}
                                    <div className="shrink-0">
                                      {isExpanded
                                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      }
                                    </div>
                                  </div>

                                  {/* Confidence bar */}
                                  <div className="mt-2 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${getConfidenceBarColor(match.confidence)}`}
                                      style={{ width: `${match.confidence}%` }}
                                    />
                                  </div>
                                </div>

                                {/* Expanded details */}
                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="px-3 pb-3 border-t border-border/50 pt-3 space-y-2.5">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                          <div>
                                            <span className="text-muted-foreground">Listed Entity:</span>
                                            <p className="font-medium text-xs mt-0.5">{match.listedEntity}</p>
                                          </div>
                                          <div>
                                            <span className="text-muted-foreground">List ID:</span>
                                            <p className="font-mono text-[10px] mt-0.5">{match.listedEntityId}</p>
                                          </div>
                                          <div>
                                            <span className="text-muted-foreground">Program:</span>
                                            <p className="font-medium text-xs mt-0.5">{match.program}</p>
                                          </div>
                                          <div>
                                            <span className="text-muted-foreground">Screened:</span>
                                            <p className="text-xs mt-0.5">{formatTimeAgo(match.screenedAt)}</p>
                                          </div>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex gap-2 pt-1">
                                          {match.status === 'Pending Review' && (
                                            <>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-[10px] flex-1 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleStatusChange(match.id, 'False Positive');
                                                }}
                                              >
                                                <XCircle className="h-3 w-3 mr-1" />
                                                Mark False Positive
                                              </Button>
                                              <Button
                                                size="sm"
                                                className="h-7 text-[10px] flex-1 bg-red-600 hover:bg-red-700 text-white"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleStatusChange(match.id, 'Confirmed Match');
                                                }}
                                              >
                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                Confirm Match
                                              </Button>
                                            </>
                                          )}
                                          {match.status === 'Confirmed Match' && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-7 text-[10px] w-full border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleStatusChange(match.id, 'Pending Review');
                                              }}
                                            >
                                              <RefreshCw className="h-3 w-3 mr-1" />
                                              Re-review
                                            </Button>
                                          )}
                                          {match.status === 'False Positive' && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-7 text-[10px] w-full border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleStatusChange(match.id, 'Pending Review');
                                              }}
                                            >
                                              <Eye className="h-3 w-3 mr-1" />
                                              Re-review
                                            </Button>
                                          )}
                                          {match.status === 'Cleared' && (
                                            <div className="flex items-center justify-center w-full text-[10px] text-emerald-600 dark:text-emerald-400 gap-1">
                                              <CheckCircle2 className="h-3 w-3" />
                                              Cleared — No action required
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Alerts integration info */}
                {alertsData?.alerts && (alertsData.alerts as Array<Record<string, unknown>>).length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Related Sanctions Alerts</p>
                      <div className="space-y-1.5">
                        {(alertsData.alerts as Array<Record<string, unknown>>).slice(0, 3).map((alert, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/50 text-xs">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span className="font-medium truncate">
                              {(alert.alertType as string)?.replace(/_/g, ' ') ?? 'Sanctions Alert'}
                            </span>
                            <span className="ml-auto text-muted-foreground text-[10px] shrink-0">
                              {formatTimeAgo(alert.createdAt as string)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t border-border px-4 py-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-slate-400" />
                  No sources configured
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    High (&gt;80%)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Medium (50-80%)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Low (&lt;50%)
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground mt-1.5 text-center">
                Sanctions screening is for compliance guidance only. Verify all matches before taking action.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
