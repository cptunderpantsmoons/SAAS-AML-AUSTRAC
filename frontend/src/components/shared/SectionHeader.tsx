'use client';

import { type LucideIcon, ChevronRight } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  accentColor?: string;
  breadcrumb?: string[];
}

export function SectionHeader({ title, description, icon: Icon, actions, accentColor, breadcrumb }: SectionHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="relative p-3 rounded-xl bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-800 dark:via-slate-800/80 dark:to-slate-900 shadow-md dark:shadow-slate-900/50">
            {/* Subtle glow behind icon */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-slate-200/60 to-transparent dark:from-slate-600/20 dark:to-transparent" />
            <Icon className="relative h-5 w-5 text-slate-600 dark:text-slate-300" />
          </div>
        )}
        <div>
          <div className="relative inline-block">
            <h2 className="text-xl font-bold text-gradient">{title}</h2>
            {/* Colored accent line below header */}
            <div
              className="absolute -bottom-1 left-0 h-[3px] w-12 rounded-full"
              style={{
                backgroundColor: accentColor ?? 'oklch(0.55 0.15 250 / 60%)',
                boxShadow: accentColor ? `0 0 8px -2px ${accentColor}40` : undefined,
              }}
            />
            {/* Animated gradient underline */}
            <div className="absolute -bottom-0.5 left-0 h-0.5 w-full rounded-full bg-gradient-to-r from-slate-400/0 via-slate-500/50 to-slate-400/0 dark:from-slate-400/0 dark:via-slate-300/40 dark:to-slate-400/0 animate-[shimmer_3s_ease-in-out_infinite]" style={{ backgroundSize: '200% 100%' }} />
          </div>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
          {/* Breadcrumb trail */}
          {breadcrumb && breadcrumb.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              {breadcrumb.map((item, idx) => (
                <span key={idx} className="flex items-center gap-1">
                  {idx > 0 && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/50" />}
                  <span className={`text-[10px] tracking-wide ${idx === breadcrumb.length - 1 ? 'text-muted-foreground font-medium' : 'text-muted-foreground/60'}`}>
                    {item}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
