'use client';

import React from 'react';

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
    payload?: Record<string, unknown>;
  }>;
  label?: string;
  title?: string;
  valueFormatter?: (value: number, name: string) => string;
  extraRows?: Array<{ label: string; value: string; color?: string }>;
}

export function ChartTooltip({
  active,
  payload,
  label,
  title,
  valueFormatter,
  extraRows,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-popover border border-border rounded-xl shadow-xl px-4 py-3 min-w-[160px]">
      {/* Label / Date */}
      {label && (
        <p className="text-xs font-semibold text-foreground mb-2 pb-2 border-b border-border/50">
          {label}
        </p>
      )}

      {/* Title */}
      {title && (
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
          {title}
        </p>
      )}

      {/* Data rows */}
      <div className="space-y-1.5">
        {payload.map((entry, idx) => {
          const displayValue = valueFormatter
            ? valueFormatter(entry.value, entry.name)
            : entry.value.toLocaleString();

          return (
            <div key={idx} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-muted-foreground">
                  {entry.name}
                </span>
              </div>
              <span className="text-xs font-bold text-foreground">
                {displayValue}
              </span>
            </div>
          );
        })}

        {/* Extra rows */}
        {extraRows?.map((row, idx) => (
          <div key={`extra-${idx}`} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: row.color ?? '#94a3b8' }}
              />
              <span className="text-xs text-muted-foreground">{row.label}</span>
            </div>
            <span className="text-xs font-semibold text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
