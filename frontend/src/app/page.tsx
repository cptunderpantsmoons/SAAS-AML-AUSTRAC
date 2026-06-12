'use client';

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileSearch, UserPlus, GitBranch, Activity,
  FileText, Shield, Menu, X, Bell, Moon, Sun, ChevronRight, Home as HomeIcon,
  AlertTriangle, Clock, Sparkles, Settings, Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useSeed, useDashboardStats, useAlerts } from '@/hooks/useApi';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { GlobalSearch } from '@/components/shared/GlobalSearch';
import { AIAssistantPanel } from '@/components/shared/AIAssistantPanel';
import { SanctionsScreeningPanel } from '@/components/shared/SanctionsScreeningPanel';
import { ClientProfilePanel } from '@/components/shared/ClientProfilePanel';
import { LiveAlertTicker } from '@/components/shared/LiveAlertTicker';
import { Toaster } from '@/components/ui/sonner';

import { DashboardSection } from '@/components/sections/DashboardSection';
import { DocumentEngineSection } from '@/components/sections/DocumentEngineSection';
import { OnboardingSection } from '@/components/sections/OnboardingSection';
import { UBOAnalysisSection } from '@/components/sections/UBOAnalysisSection';
import { TransactionMonitoringSection } from '@/components/sections/TransactionMonitoringSection';
import { ReportingSection } from '@/components/sections/ReportingSection';
import { GovernanceSection } from '@/components/sections/GovernanceSection';
import { SettingsSection } from '@/components/sections/SettingsSection';
import { CaseManagementSection } from '@/components/sections/CaseManagementSection';
import { KeyboardShortcutsDialog } from '@/components/shared/KeyboardShortcutsDialog';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000, refetchOnWindowFocus: false },
  },
});

type Section = 'dashboard' | 'documents' | 'onboarding' | 'ubo' | 'transactions' | 'cases' | 'reporting' | 'governance' | 'settings';

const navItems: { id: Section; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Overview & KPIs' },
  { id: 'documents', label: 'Document Engine', icon: FileSearch, description: 'Detection & Analysis' },
  { id: 'onboarding', label: 'Client Onboarding', icon: UserPlus, description: 'KYC/KYB Workflow' },
  { id: 'ubo', label: 'UBO Analysis', icon: GitBranch, description: 'Ownership Graph' },
  { id: 'transactions', label: 'Transaction Monitor', icon: Activity, description: 'Rules & Alerts' },
  { id: 'cases', label: 'Case Management', icon: Briefcase, description: 'Investigations & SARs' },
  { id: 'reporting', label: 'AUSTRAC Reports', icon: FileText, description: 'SMR/TTR/IFTI-E' },
  { id: 'governance', label: 'Governance & Audit', icon: Shield, description: 'Compliance Dashboard' },
  { id: 'settings', label: 'Settings', icon: Settings, description: 'Configuration' },
];

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
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-AU');
}

function AppContent() {
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [sanctionsPanelOpen, setSanctionsPanelOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const seedMutation = useSeed();
  const { data: stats } = useDashboardStats();
  const { data: alertsData } = useAlerts({ status: 'open', limit: 5 });

  useEffect(() => {
    // Check if database has been seeded already
    const hasSeeded = sessionStorage.getItem('aml-ctf-seeded');
    if (!hasSeeded) {
      seedMutation.mutate(undefined, {
        onSuccess: () => { sessionStorage.setItem('aml-ctf-seeded', 'true'); },
        onError: () => { sessionStorage.setItem('aml-ctf-seeded', 'true'); },
      });
    }
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+/ or Ctrl+/ for shortcuts dialog
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }
      // Cmd+Shift+A for AI assistant
      if (e.key === 'a' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setAiPanelOpen(true);
        return;
      }
      // Number keys for section navigation (only when not in an input)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const sectionMap: Record<string, Section> = {
        '1': 'dashboard', '2': 'documents', '3': 'onboarding', '4': 'ubo',
        '5': 'transactions', '6': 'cases', '7': 'reporting', '8': 'governance', '9': 'settings',
      };
      if (sectionMap[e.key]) {
        e.preventDefault();
        setActiveSection(sectionMap[e.key]);
        return;
      }
      if (e.key === 'd' || e.key === 'D') { setActiveSection('dashboard'); return; }
      if (e.key === 'g' || e.key === 'G') { setActiveSection('governance'); return; }
      if (e.key === 'n' || e.key === 'N') { setActiveSection('onboarding'); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openAlerts = stats?.metrics.openAlerts ?? 0;
  const recentAlerts = (alertsData?.alerts ?? []) as Array<Record<string, unknown>>;

  // Get current section label for AI context
  const sectionContext = navItems.find(n => n.id === activeSection)?.label ?? 'Dashboard';

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard': return <DashboardSection onNavigate={(section) => setActiveSection(section)} onClientSelect={(id) => setSelectedClientId(id)} />;
      case 'documents': return <DocumentEngineSection onClientSelect={(id) => setSelectedClientId(id)} />;
      case 'onboarding': return <OnboardingSection onClientSelect={(id) => setSelectedClientId(id)} />;
      case 'ubo': return <UBOAnalysisSection />;
      case 'transactions': return <TransactionMonitoringSection onClientSelect={(id) => setSelectedClientId(id)} />;
      case 'cases': return <CaseManagementSection />;
      case 'reporting': return <ReportingSection />;
      case 'governance': return <GovernanceSection />;
      case 'settings': return <SettingsSection />;
    }
  };

  const activeNav = navItems.find((n) => n.id === activeSection);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-border bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-900 dark:to-slate-950">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-sm text-white">AML/CTF Shield</h1>
              <p className="text-[10px] text-slate-300">Compliance Platform</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto lg:hidden h-8 w-8 text-white hover:bg-white/10"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 p-3">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-foreground'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-slate-700 dark:bg-slate-300" />
                  )}
                  <item.icon className={`h-4 w-4 ${isActive ? 'text-slate-700 dark:text-slate-300' : ''}`} />
                  <div className="flex-1 text-left">
                    <div>{item.label}</div>
                    <div className={`text-[10px] ${isActive ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                      {item.description}
                    </div>
                  </div>
                  {isActive && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                </button>
              );
            })}
          </nav>
        </ScrollArea>

        {/* AI Assistant & Sanctions Buttons in Sidebar */}
        <div className="p-3 border-t border-border space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-10 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:from-violet-100 hover:to-purple-100 dark:hover:from-violet-950/50 dark:hover:to-purple-950/50 transition-all duration-200"
            onClick={() => setAiPanelOpen(true)}
          >
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-medium">Compliance AI</span>
            <Badge variant="outline" className="ml-auto text-[8px] h-4 px-1 border-violet-300 dark:border-violet-700 text-violet-500 dark:text-violet-500">
              NEW
            </Badge>
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-10 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:from-amber-100 hover:to-orange-100 dark:hover:from-amber-950/50 dark:hover:to-orange-950/50 transition-all duration-200"
            onClick={() => setSanctionsPanelOpen(true)}
          >
            <Shield className="h-4 w-4" />
            <span className="text-xs font-medium">Sanctions Check</span>
            <Badge variant="outline" className="ml-auto text-[8px] h-4 px-1 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-500">
              OFF
            </Badge>
          </Button>
          <div className="flex items-center gap-2 px-3 py-2 mt-1 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-emerald-500 system-operational-dot" />
            System Operational
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-9 w-9"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              {/* Breadcrumb navigation */}
              <nav className="flex items-center gap-1.5 text-sm">
                <HomeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                <span className="text-muted-foreground text-xs">AML/CTF Shield</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                <span className="font-medium text-xs">{activeNav?.label ?? 'Dashboard'}</span>
              </nav>
            </div>

            {/* Global Search */}
            <div className="flex-1 max-w-[280px] mx-4 hidden md:block">
              <GlobalSearch onNavigate={(section) => setActiveSection(section as Section)} />
            </div>

            <div className="flex items-center gap-2">
              {/* Mobile Search */}
              <div className="md:hidden">
                <GlobalSearch compact onNavigate={(section) => setActiveSection(section as Section)} />
              </div>

              {/* AI Assistant Button */}
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 focus-ring hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
                onClick={() => setAiPanelOpen(true)}
                title="Open Compliance AI Assistant"
              >
                <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <span className="sr-only">AI Assistant</span>
              </Button>

              {/* Sanctions Screening Button */}
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 focus-ring hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                onClick={() => setSanctionsPanelOpen(true)}
                title="Open Sanctions Screening"
              >
                <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="sr-only">Sanctions Screening</span>
              </Button>

              {/* Notifications Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative h-9 w-9 focus-ring">
                    <Bell className="h-4 w-4" />
                    {openAlerts > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-[10px]">
                        {openAlerts > 9 ? '9+' : openAlerts}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-3 border-b">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">Notifications</h4>
                      <Badge variant="outline" className="text-[10px]">{openAlerts} open</Badge>
                    </div>
                  </div>
                  <ScrollArea className="max-h-72">
                    <div className="divide-y">
                      {recentAlerts.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No open alerts
                        </div>
                      ) : (
                        recentAlerts.map((alert) => {
                          const client = alert.client as Record<string, unknown> | undefined;
                          const severity = (alert.finalSeverity as string) ?? (alert.baseSeverity as string) ?? 'medium';
                          const severityColor = severity === 'critical' ? 'bg-red-500' : severity === 'high' ? 'bg-orange-500' : severity === 'medium' ? 'bg-amber-500' : 'bg-emerald-500';
                          return (
                            <div key={alert.id as string} className="p-3 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setActiveSection('transactions')}>
                              <div className="flex items-start gap-2">
                                <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${severityColor}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">
                                    {(alert.alertType as string)?.replace(/_/g, ' ') ?? 'Alert'}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {client?.fullName as string ?? 'Unknown Client'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                                  <Clock className="h-3 w-3" />
                                  {formatTimeAgo(alert.createdAt as string)}
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 ml-4">
                                {alert.description as string}
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                  {openAlerts > 5 && (
                    <div className="px-3 py-1.5 text-center text-[10px] text-muted-foreground bg-muted/30 border-t">
                      +{openAlerts - 5} more alerts not shown
                    </div>
                  )}
                  <div className="p-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs justify-center"
                      onClick={() => setActiveSection('transactions')}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" /> View All Alerts
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <ThemeToggle />
              <Separator orientation="vertical" className="h-6" />
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700">CO</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-4 sm:p-6"
            >
              {/* Live Alert Ticker - shown on Dashboard */}
              {activeSection === 'dashboard' && (
                <LiveAlertTicker onNavigate={(section) => setActiveSection(section as Section)} />
              )}

              {renderSection()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="relative border-t border-border px-4 sm:px-6 py-4 mt-auto bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-950/50">
          {/* Top border gradient (slate → transparent) */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-400/40 dark:via-slate-500/30 to-transparent" />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-foreground">AML/CTF Shield</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[9px] font-mono">v1.0.0</span>
                <Separator orientation="vertical" className="h-3 hidden sm:block" />
                <span className="hidden sm:inline">&copy; {new Date().getFullYear()} AML AUSTRAC</span>
              </div>
              <div className="flex items-center gap-2">
                <Separator orientation="vertical" className="h-3 hidden sm:block" />
                <span className="flex items-center gap-1 text-[10px]">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 system-operational-dot" />
                  All Systems Operational
                </span>
                <Separator orientation="vertical" className="h-3" />
                <span className="text-[10px] text-muted-foreground/70">Build {new Date().toISOString().split('T')[0]}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 justify-start sm:justify-end">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 text-[10px] font-medium border border-violet-200 dark:border-violet-800">
                <Sparkles className="h-3 w-3" /> AI-Powered
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium border border-emerald-200 dark:border-emerald-800">
                <Shield className="h-3 w-3" /> AUSTRAC
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-medium border border-slate-200 dark:border-slate-700">
                ISO 27001
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-medium border border-slate-200 dark:border-slate-700">
                SOC 2
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[10px] font-medium border border-amber-200 dark:border-amber-800">
                Privacy Act 1988
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* AI Assistant Panel */}
      <AIAssistantPanel
        isOpen={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        context={sectionContext}
      />

      {/* Sanctions Screening Panel */}
      <SanctionsScreeningPanel
        isOpen={sanctionsPanelOpen}
        onClose={() => setSanctionsPanelOpen(false)}
      />

      {/* Client Profile Panel */}
      <ClientProfilePanel
        clientId={selectedClientId}
        onClose={() => setSelectedClientId(null)}
        onNavigate={(section) => {
          setSelectedClientId(null);
          setActiveSection(section as Section);
        }}
      />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </div>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    document.documentElement.classList.toggle('dark', newIsDark);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 focus-ring"
      onClick={toggleTheme}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light">
        <AppContent />
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
