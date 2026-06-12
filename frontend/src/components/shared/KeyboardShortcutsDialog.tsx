'use client';

import React from 'react';
import { Keyboard, Command, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  title: string;
  icon: React.ElementType;
  shortcuts: Shortcut[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Navigation',
    icon: ArrowRight,
    shortcuts: [
      { keys: ['1'], description: 'Go to Dashboard' },
      { keys: ['2'], description: 'Go to Document Engine' },
      { keys: ['3'], description: 'Go to Client Onboarding' },
      { keys: ['4'], description: 'Go to UBO Analysis' },
      { keys: ['5'], description: 'Go to Transaction Monitor' },
      { keys: ['6'], description: 'Go to AUSTRAC Reports' },
      { keys: ['7'], description: 'Go to Governance & Audit' },
      { keys: ['8'], description: 'Go to Settings' },
      { keys: ['D'], description: 'Go to Dashboard' },
      { keys: ['G'], description: 'Go to Governance' },
    ],
  },
  {
    title: 'Actions',
    icon: Command,
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open global search' },
      { keys: ['⌘', '/'], description: 'Show keyboard shortcuts' },
      { keys: ['N'], description: 'Create new client' },
      { keys: ['Esc'], description: 'Close panel / dialog' },
    ],
  },
  {
    title: 'AI Assistant',
    icon: Keyboard,
    shortcuts: [
      { keys: ['⌘', '⇧', 'A'], description: 'Open AI Compliance Assistant' },
    ],
  },
];

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md border border-border bg-muted/80 text-[11px] font-mono font-medium text-foreground shadow-[0_1px_0_1px_rgba(0,0,0,0.05)]">
      {children}
    </kbd>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors">
      <span className="text-xs text-foreground">{shortcut.description}</span>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <span className="text-[10px] text-muted-foreground mx-0.5">+</span>
            )}
            <KeyCap>{key}</KeyCap>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-5 w-5 text-muted-foreground" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs">
            Use these shortcuts to navigate and interact with the platform faster.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 max-h-[60vh] overflow-y-auto space-y-5" style={{ scrollbarGutter: 'stable' }}>
          {SHORTCUT_CATEGORIES.map((category, catIdx) => (
            <div key={category.title}>
              <div className="flex items-center gap-2 mb-2">
                <category.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {category.title}
                </h3>
                <Badge variant="outline" className="text-[9px] ml-auto">
                  {category.shortcuts.length}
                </Badge>
              </div>
              <div className="space-y-0.5 bg-muted/20 rounded-lg p-1">
                {category.shortcuts.map((shortcut, idx) => (
                  <ShortcutRow key={idx} shortcut={shortcut} />
                ))}
              </div>
              {catIdx < SHORTCUT_CATEGORIES.length - 1 && (
                <Separator className="mt-4" />
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-3 bg-muted/30 border-t flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            <KeyCap>⌘</KeyCap> = <KeyCap>Ctrl</KeyCap> on Windows/Linux
          </p>
          <p className="text-[10px] text-muted-foreground">
            Press <KeyCap>Esc</KeyCap> to close
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
