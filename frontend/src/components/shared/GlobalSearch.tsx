'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useGlobalSearch } from '@/hooks/useApi';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { RiskBadge } from '@/components/shared/RiskBadge';
import {
  Search,
  Users,
  FileText,
  AlertTriangle,
  DollarSign,
  FileCheck,
  Loader2,
  ArrowRight,
} from 'lucide-react';

interface GlobalSearchProps {
  onNavigate: (section: string) => void;
  compact?: boolean;
}

interface SearchResult {
  type: string;
  id: string;
  label: string;
  sublabel: string;
  extra: string;
  section: string;
}

const typeConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  Client: { icon: Users, label: 'Clients', color: 'text-sky-600 dark:text-sky-400' },
  Document: { icon: FileText, label: 'Documents', color: 'text-violet-600 dark:text-violet-400' },
  Alert: { icon: AlertTriangle, label: 'Alerts', color: 'text-amber-600 dark:text-amber-400' },
  Transaction: { icon: DollarSign, label: 'Transactions', color: 'text-emerald-600 dark:text-emerald-400' },
  Report: { icon: FileCheck, label: 'Reports', color: 'text-rose-600 dark:text-rose-400' },
};

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function GlobalSearch({ onNavigate, compact = false }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  const { data, isLoading } = useGlobalSearch(debouncedQuery);

  const results = useMemo(() => data?.results ?? [], [data?.results]);

  // Group results by type
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    const typeOrder = ['Client', 'Document', 'Alert', 'Transaction', 'Report'];

    for (const result of results) {
      if (!groups[result.type]) {
        groups[result.type] = [];
      }
      groups[result.type].push(result);
    }

    // Return in defined order
    return typeOrder
      .filter((type) => groups[type])
      .map((type) => ({ type, items: groups[type] }));
  }, [results]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => results, [results]);

  // Reset selection when query changes (done in onChange, not effect)

  // Keyboard shortcut: ⌘K / Ctrl+K to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        if (!open) {
          setQuery('');
          setSelectedIndex(-1);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      // Small delay to ensure popover is mounted
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery('');
      onNavigate(result.section);
    },
    [onNavigate]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < flatResults.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : flatResults.length - 1
        );
      } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < flatResults.length) {
        e.preventDefault();
        handleSelect(flatResults[selectedIndex]);
      } else if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    },
    [flatResults, selectedIndex, handleSelect]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedEl = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const shortcutLabel = isMac ? '⌘K' : 'Ctrl+K';

  const showNoResults = debouncedQuery.length >= 2 && !isLoading && results.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <button
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-muted/40 hover:bg-muted/70 text-muted-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-1"
            aria-label="Search (⌘K)"
          >
            <Search className="h-4 w-4" />
          </button>
        ) : (
          <button
            className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-muted/40 hover:bg-muted/70 text-muted-foreground text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-1 w-full max-w-[280px]"
            aria-label="Search (⌘K)"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left truncate">Search everything…</span>
            <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              {shortcutLabel}
            </kbd>
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[320px] sm:w-[440px] p-0 rounded-xl shadow-xl border-border/80 overflow-hidden"
        align="start"
        sideOffset={8}
      >
        {/* Search Input */}
        <div className="flex items-center gap-2 px-3 border-b border-border bg-background">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(-1); }}
            onKeyDown={handleKeyDown}
            placeholder="Search clients, documents, alerts, transactions, reports…"
            className="flex-1 h-11 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          {isLoading && (
            <Loader2 className="h-4 w-4 shrink-0 text-muted-foreground animate-spin" />
          )}
          {query && !isLoading && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <span className="text-xs">✕</span>
            </button>
          )}
          <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef}>
          {showNoResults ? (
            <div className="py-10 text-center">
              <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">No results found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Try a different search term
              </p>
            </div>
          ) : debouncedQuery.length < 2 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground/70">
                Type at least 2 characters to search
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[360px]">
              <div className="py-1">
                {groupedResults.map((group, groupIndex) => {
                  const config = typeConfig[group.type] ?? typeConfig.Client;
                  const Icon = config.icon;

                  return (
                    <div key={group.type}>
                      {groupIndex > 0 && <Separator className="my-1" />}
                      {/* Group Header */}
                      <div className="flex items-center gap-2 px-3 py-1.5">
                        <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {config.label}
                        </span>
                        <Badge
                          variant="secondary"
                          className="ml-auto text-[10px] h-4 px-1.5 font-medium"
                        >
                          {group.items.length}
                        </Badge>
                      </div>

                      {/* Group Items */}
                      {group.items.map((item) => {
                        const globalIndex = flatResults.findIndex(
                          (r) => r.id === item.id
                        );
                        const isSelected = globalIndex === selectedIndex;

                        return (
                          <div
                            key={item.id}
                            data-index={globalIndex}
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => handleSelect(item)}
                            className={`
                              flex items-center gap-3 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-all duration-150
                              ${
                                isSelected
                                  ? 'bg-accent text-accent-foreground shadow-sm'
                                  : 'hover:bg-muted/60 text-foreground'
                              }
                            `}
                          >
                            {/* Type Icon */}
                            <div
                              className={`flex items-center justify-center h-8 w-8 rounded-md shrink-0 ${
                                isSelected
                                  ? 'bg-accent/80'
                                  : 'bg-muted/50'
                              }`}
                            >
                              <Icon className={`h-4 w-4 ${config.color}`} />
                            </div>

                            {/* Text Content */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate leading-tight">
                                {item.label}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                                {item.sublabel}
                              </p>
                            </div>

                            {/* Extra / Badge */}
                            <div className="shrink-0 flex items-center gap-1.5">
                              {item.extra && (
                                <RiskBadge
                                  level={item.extra.toLowerCase()}
                                />
                              )}
                              {isSelected && (
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="border-t border-border px-3 py-2 bg-muted/30">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex h-4 px-1 rounded border border-border bg-muted font-mono text-[9px]">↑</kbd>
                  <kbd className="inline-flex h-4 px-1 rounded border border-border bg-muted font-mono text-[9px]">↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex h-4 px-1 rounded border border-border bg-muted font-mono text-[9px]">↵</kbd>
                  Select
                </span>
              </div>
              <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
