'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Clock, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAlerts } from '@/hooks/useApi';
import { RiskBadge } from '@/components/shared/RiskBadge';

interface LiveAlertTickerProps {
  onNavigate?: (section: string) => void;
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
  return `${Math.floor(diffHours / 24)}d ago`;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-50/80 dark:bg-red-950/20',
  high: 'border-l-orange-500 bg-orange-50/80 dark:bg-orange-950/20',
  medium: 'border-l-amber-500 bg-amber-50/80 dark:bg-amber-950/20',
  low: 'border-l-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/20',
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
};

export function LiveAlertTicker({ onNavigate }: LiveAlertTickerProps) {
  const { data: alertsData } = useAlerts({ status: 'open', limit: 8 });

  const alerts = useMemo(() => {
    return (alertsData?.alerts ?? []) as Array<Record<string, unknown>>;
  }, [alertsData?.alerts]);

  if (alerts.length === 0) return null;

  return (
    <div className="mb-4">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden shadow-sm"
      >
        {/* Ticker Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-red-50/50 via-amber-50/30 to-transparent dark:from-red-950/20 dark:via-amber-950/10 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <div className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-red-500 rounded-full animate-pulse" />
            </div>
            <span className="text-xs font-semibold text-foreground">Live Alerts</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
              {alerts.length} active
            </Badge>
          </div>
          <button
            onClick={() => onNavigate?.('transactions')}
            className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            View All <AlertTriangle className="h-3 w-3" />
          </button>
        </div>

        {/* Scrolling Alert Cards — increased height, no truncation */}
        <div className="p-2 space-y-1.5 max-h-[220px] overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {alerts.map((alert, idx) => {
              const severity = (alert.finalSeverity as string) ?? (alert.baseSeverity as string) ?? 'medium';
              const client = alert.client as Record<string, unknown> | undefined;
              const severityStyle = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.medium;
              const severityDot = SEVERITY_DOT[severity] ?? SEVERITY_DOT.medium;

              return (
                <motion.div
                  key={alert.id as string}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.3 }}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border-l-[3px] ${severityStyle} transition-all duration-200 hover:shadow-sm cursor-pointer group`}
                  onClick={() => onNavigate?.('transactions')}
                >
                  <div className={`h-2 w-2 rounded-full mt-1.5 ${severityDot} shrink-0 group-hover:scale-125 transition-transform`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">
                        {(alert.alertType as string)?.replace(/_/g, ' ')}
                      </span>
                      <RiskBadge level={severity} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      <span className="font-medium">{client?.fullName as string ?? 'Unknown Client'}</span>
                      {alert.description ? (
                        <span className="text-muted-foreground/80"> — {(alert.description as string).slice(0, 80)}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <Clock className="h-3 w-3 text-muted-foreground/40" />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatTimeAgo(alert.createdAt as string)}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
