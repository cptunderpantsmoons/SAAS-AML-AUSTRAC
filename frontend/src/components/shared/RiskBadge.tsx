'use client';

import { Badge } from '@/components/ui/badge';

const riskConfig: Record<string, { className: string; label: string }> = {
  low: { className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', label: 'Low' },
  medium: { className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800', label: 'Medium' },
  high: { className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800', label: 'High' },
  critical: { className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800', label: 'Critical' },
  clear: { className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700', label: 'Clear' },
};

export function RiskBadge({ level, score }: { level: string; score?: number }) {
  const config = riskConfig[level.toLowerCase()] ?? riskConfig.low;
  return (
    <Badge variant="outline" className={`${config.className} font-medium text-xs`}>
      {config.label}
      {score !== undefined && ` ${(score * 100).toFixed(0)}%`}
    </Badge>
  );
}
