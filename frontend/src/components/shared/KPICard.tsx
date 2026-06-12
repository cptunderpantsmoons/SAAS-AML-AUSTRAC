'use client';

import { Card } from '@/components/ui/card';
import { type LucideIcon, ArrowUp, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useMemo } from 'react';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; direction: 'up' | 'down' };
  color?: 'emerald' | 'amber' | 'red' | 'blue' | 'slate';
  sparklineData?: number[];
  /** When true, inverts trend color logic: UP = red (bad), DOWN = green (good).
   *  Use for negative metrics like alerts where increase is undesirable. */
  invertTrend?: boolean;
}

const colorMap = {
  emerald: {
    gradient: 'from-emerald-50 via-emerald-50/80 to-white dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-card',
    icon: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800',
    ring: 'ring-1 ring-emerald-200/60 dark:ring-emerald-800/60',
    glow: 'hover:shadow-emerald-200/50 dark:hover:shadow-emerald-900/40',
    accent: '#10b981',
    sparkline: '#10b981',
  },
  amber: {
    gradient: 'from-amber-50 via-amber-50/80 to-white dark:from-amber-950/40 dark:via-amber-950/20 dark:to-card',
    icon: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
    ring: 'ring-1 ring-amber-200/60 dark:ring-amber-800/60',
    glow: 'hover:shadow-amber-200/50 dark:hover:shadow-amber-900/40',
    accent: '#f59e0b',
    sparkline: '#f59e0b',
  },
  red: {
    gradient: 'from-red-50 via-red-50/80 to-white dark:from-red-950/40 dark:via-red-950/20 dark:to-card',
    icon: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
    ring: 'ring-1 ring-red-200/60 dark:ring-red-800/60',
    glow: 'hover:shadow-red-200/50 dark:hover:shadow-red-900/40',
    accent: '#ef4444',
    sparkline: '#ef4444',
  },
  blue: {
    gradient: 'from-sky-50 via-sky-50/80 to-white dark:from-sky-950/40 dark:via-sky-950/20 dark:to-card',
    icon: 'text-sky-600 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-800',
    ring: 'ring-1 ring-sky-200/60 dark:ring-sky-800/60',
    glow: 'hover:shadow-sky-200/50 dark:hover:shadow-sky-900/40',
    accent: '#0ea5e9',
    sparkline: '#0ea5e9',
  },
  slate: {
    gradient: 'from-slate-50 via-slate-50/80 to-white dark:from-slate-800/40 dark:via-slate-800/20 dark:to-card',
    icon: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-700',
    ring: 'ring-1 ring-slate-200/60 dark:ring-slate-700/60',
    glow: 'hover:shadow-slate-300/50 dark:hover:shadow-slate-700/40',
    accent: '#64748b',
    sparkline: '#64748b',
  },
};

/** Generate a deterministic sparkline SVG polyline points from a seed */
function generateSparklinePoints(seed: number): string {
  const points: string[] = [];
  const width = 100;
  const height = 32;
  const count = 7;
  // Simple seeded random
  let s = seed;
  const nextRand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * width;
    const y = height - nextRand() * height * 0.7 - height * 0.1;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(' ');
}

export function KPICard({ title, value, icon: Icon, trend, color = 'slate', sparklineData, invertTrend = false }: KPICardProps) {
  const colors = colorMap[color];
  const isFirstRender = useRef(true);

  // Mark first render as complete after mount
  // Using ref to avoid setState-in-effect lint error
  const valueKey = String(value);

  // Generate a deterministic sparkline based on title, or use provided data
  const sparklineSeed = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = ((hash << 5) - hash) + title.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }, [title]);

  const sparklinePoints = useMemo(() => {
    if (sparklineData && sparklineData.length >= 2) {
      const width = 100;
      const height = 32;
      const min = Math.min(...sparklineData);
      const max = Math.max(...sparklineData);
      const range = max - min || 1;
      return sparklineData.map((v, i) => {
        const x = (i / (sparklineData.length - 1)) * width;
        const y = height - ((v - min) / range) * height * 0.7 - height * 0.15;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
    }
    return generateSparklinePoints(sparklineSeed);
  }, [sparklineData, sparklineSeed]);

  // Compute the latest sparkline point for the dot indicator
  const latestSparklinePoint = useMemo(() => {
    const points = sparklinePoints.split(' ');
    if (points.length === 0) return null;
    const last = points[points.length - 1];
    const [x, y] = last.split(',').map(Number);
    return { x, y };
  }, [sparklinePoints]);

  // Unique gradient ID per card to avoid collisions
  const gradientId = useMemo(() => `sparkline-grad-${sparklineSeed}`, [sparklineSeed]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02, y: -2 }}
      onAnimationComplete={() => { isFirstRender.current = false; }}
    >
      <Card className={`group relative p-4 border ${colors.border} bg-gradient-to-br ${colors.gradient} hover:shadow-lg ${colors.glow} transition-all duration-300 cursor-default overflow-hidden`}>
        {/* Border glow effect on hover */}
        <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 0 1px oklch(0.7 0.05 250 / 15%), 0 0 20px -4px oklch(0.7 0.05 250 / 10%)',
          }}
        />

        {/* Bottom border accent */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px] opacity-60 group-hover:opacity-100 transition-opacity duration-300"
          style={{ backgroundColor: colors.accent }}
        />

        {/* Background sparkline with gradient fill */}
        <svg
          className="absolute bottom-0 right-0 w-[70%] h-12 opacity-[0.10] group-hover:opacity-[0.18] transition-opacity duration-300 pointer-events-none"
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.sparkline} stopOpacity="0.4" />
              <stop offset="100%" stopColor={colors.sparkline} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Filled area under the line */}
          <polygon
            points={`0,32 ${sparklinePoints} 100,32`}
            fill={`url(#${gradientId})`}
          />
          {/* Line */}
          <polyline
            points={sparklinePoints}
            fill="none"
            stroke={colors.sparkline}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Dot at the latest data point */}
          {latestSparklinePoint && (
            <circle
              cx={latestSparklinePoint.x}
              cy={latestSparklinePoint.y}
              r="2"
              fill={colors.sparkline}
              stroke="white"
              strokeWidth="0.5"
              opacity="0.8"
            />
          )}
        </svg>

        <div className="relative flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <AnimatePresence mode="popLayout">
              <motion.p
                key={valueKey}
                className="text-3xl font-extrabold metric-value metric-glow tabular-nums"
                initial={{ scale: 1.08, opacity: 0.8 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                {value}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className={`p-3 rounded-xl ${colors.ring} bg-white/60 dark:bg-background/60 ${colors.icon}`}>
            <Icon className="h-5.5 w-5.5" />
          </div>
        </div>
        {trend && (
          <div className="flex items-center mt-2 text-xs">
            <motion.span
              initial={{ y: 3, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="flex items-center"
            >
              {trend.direction === 'up' ? (
                <motion.span
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="inline-flex"
                >
                  <ArrowUp className={`h-3 w-3 ${invertTrend ? 'text-red-500' : 'text-emerald-500'}`} />
                </motion.span>
              ) : (
                <motion.span
                  animate={{ y: [0, 2, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="inline-flex"
                >
                  <ArrowDown className={`h-3 w-3 ${invertTrend ? 'text-emerald-500' : 'text-red-500'}`} />
                </motion.span>
              )}
            </motion.span>
            <span className={`ml-1 ${
              invertTrend
                ? trend.direction === 'up' ? 'text-red-500' : 'text-emerald-500'
                : trend.direction === 'up' ? 'text-emerald-500' : 'text-red-500'
            }`}>
              {Math.abs(trend.value)}%
            </span>
            <span className="ml-1 text-muted-foreground/80">vs last period</span>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
