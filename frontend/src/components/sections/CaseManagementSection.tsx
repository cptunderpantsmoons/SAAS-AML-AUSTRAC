'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase, Plus, Filter, ChevronDown, ChevronUp, Search,
  AlertTriangle, FileText, DollarSign, Clock, User, MessageSquare,
  ArrowUpRight, X, Link2, Paperclip, Send, MoreHorizontal,
  CheckCircle2, CircleDot, Circle, Eye, UserCheck, AlertCircle,
  BarChart3, FolderOpen, Zap, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { KPICard } from '@/components/shared/KPICard';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type CasePriority = 'critical' | 'high' | 'medium' | 'low';
type CaseStatus = 'open' | 'in_progress' | 'escalated' | 'closed';
type CaseType = 'SAR Investigation' | 'PEP Review' | 'Sanctions Review' | 'Transaction Review' | 'KYC Discrepancy';

interface CaseNote {
  id: string;
  author: string;
  content: string;
  timestamp: string;
}

interface StatusChange {
  status: CaseStatus;
  timestamp: string;
  actor: string;
  note?: string;
}

interface LinkedEvidence {
  id: string;
  type: 'document' | 'alert' | 'transaction';
  title: string;
  description: string;
  date: string;
}

interface AmlCase {
  id: string;
  caseId: string;
  title: string;
  description: string;
  type: CaseType;
  priority: CasePriority;
  status: CaseStatus;
  assignedTo: string;
  clientId: string;
  clientName: string;
  linkedAlerts: string[];
  linkedDocuments: string[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  notes: CaseNote[];
  statusTimeline: StatusChange[];
  linkedEvidence: LinkedEvidence[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const TEAM_MEMBERS: string[] = [];

const MOCK_CASES: AmlCase[] = [];

// ─── Helper Functions ─────────────────────────────────────────────────────────

const priorityConfig: Record<CasePriority, { color: string; border: string; bg: string; label: string }> = {
  critical: { color: 'text-red-700 dark:text-red-400', border: 'border-l-red-500', bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800', label: 'Critical' },
  high: { color: 'text-orange-700 dark:text-orange-400', border: 'border-l-orange-500', bg: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800', label: 'High' },
  medium: { color: 'text-amber-700 dark:text-amber-400', border: 'border-l-amber-500', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800', label: 'Medium' },
  low: { color: 'text-slate-700 dark:text-slate-400', border: 'border-l-slate-400', bg: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700', label: 'Low' },
};

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 1) return 'Today';
  if (diffDays === 1) return '1 day';
  if (diffDays < 30) return `${diffDays} days`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths > 1 ? 's' : ''}`;
}

function getCaseAge(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function CaseStatusTimeline({ timeline }: { timeline: StatusChange[] }) {
  return (
    <div className="relative pl-6">
      {timeline.map((entry, idx) => {
        const isLast = idx === timeline.length - 1;
        const statusIcon = entry.status === 'closed'
          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          : entry.status === 'escalated'
            ? <AlertCircle className="h-4 w-4 text-orange-500" />
            : entry.status === 'in_progress'
              ? <CircleDot className="h-4 w-4 text-blue-500" />
              : <Circle className="h-4 w-4 text-slate-400" />;

        return (
          <div key={idx} className="relative pb-4 last:pb-0">
            {/* Vertical line */}
            {!isLast && (
              <div className="absolute left-[-18px] top-5 bottom-0 w-px bg-border" />
            )}
            {/* Dot */}
            <div className="absolute left-[-22px] top-1 h-5 w-5 rounded-full bg-background border-2 border-border flex items-center justify-center">
              {statusIcon}
            </div>
            {/* Content */}
            <div className="ml-2">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={entry.status} />
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                by <span className="font-medium text-foreground">{entry.actor}</span>
              </p>
              {entry.note && (
                <p className="text-xs text-muted-foreground mt-1 bg-muted/40 rounded px-2 py-1">{entry.note}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EvidenceItem({ evidence }: { evidence: LinkedEvidence }) {
  const iconMap = {
    document: <Paperclip className="h-3.5 w-3.5 text-violet-500" />,
    alert: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
    transaction: <DollarSign className="h-3.5 w-3.5 text-emerald-500" />,
  };
  const typeLabel = evidence.type.charAt(0).toUpperCase() + evidence.type.slice(1);

  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors">
      <div className="mt-0.5 shrink-0">{iconMap[evidence.type]}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{evidence.title}</span>
          <Badge variant="outline" className="text-[10px] h-4 shrink-0">{typeLabel}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{evidence.description}</p>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">{evidence.id} · {evidence.date}</p>
      </div>
    </div>
  );
}

function CaseStatisticsChart({ cases }: { cases: AmlCase[] }) {
  const chartData = useMemo(() => {
    const types: CaseType[] = ['SAR Investigation', 'PEP Review', 'Sanctions Review', 'Transaction Review', 'KYC Discrepancy'];
    const statuses: CaseStatus[] = ['open', 'in_progress', 'escalated', 'closed'];

    return types.map(type => {
      const entry: Record<string, string | number> = { type: type.replace(' Review', '').replace(' Investigation', '') };
      statuses.forEach(status => {
        entry[status] = cases.filter(c => c.type === type && c.status === status).length;
      });
      return entry;
    });
  }, [cases]);

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Cases by Type & Status</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Distribution across investigation categories</p>
        </div>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="h-64 chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 5, bottom: 30, left: -5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
            <XAxis dataKey="type" tick={{ fontSize: 11 }} className="fill-muted-foreground" label={{ value: 'Case Type', position: 'insideBottom', offset: -15, fontSize: 11, className: 'fill-muted-foreground' }} />
            <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} label={{ value: 'Count', angle: -90, position: 'insideLeft', offset: 15, fontSize: 11, className: 'fill-muted-foreground' }} />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: 8 }} content={(props) => {
              const { payload } = props;
              return (
                <div className="flex items-center justify-center gap-4 pt-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">Status:</span>
                  {payload?.map((entry, index) => (
                    <span key={index} className="flex items-center gap-1.5 text-[11px]">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                      {entry.value}
                    </span>
                  ))}
                </div>
              );
            }} />
            <Bar dataKey="open" name="Open" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            <Bar dataKey="in_progress" name="In Progress" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            <Bar dataKey="escalated" name="Escalated" fill="#f97316" radius={[2, 2, 0, 0]} />
            <Bar dataKey="closed" name="Closed" fill="#64748b" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── Create Case Dialog ──────────────────────────────────────────────────────

function CreateCaseDialog({ open, onOpenChange, onCreateCase }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateCase: (newCase: AmlCase) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [caseType, setCaseType] = useState<CaseType | ''>('');
  const [priority, setPriority] = useState<CasePriority | ''>('');
  const [clientName, setClientName] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [linkedAlerts, setLinkedAlerts] = useState('');

  const handleSubmit = () => {
    if (!title || !caseType || !priority || !clientName) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newCase: AmlCase = {
      id: String(Date.now()),
      caseId: `CASE-2026-${String(MOCK_CASES.length + 1).padStart(3, '0')}`,
      title,
      description,
      type: caseType as CaseType,
      priority: priority as CasePriority,
      status: 'open',
      assignedTo: assignedTo || 'Unassigned',
      clientId: `CLT-${String(Math.floor(Math.random() * 100)).padStart(3, '0')}`,
      clientName,
      linkedAlerts: linkedAlerts ? linkedAlerts.split(',').map(a => a.trim()) : [],
      linkedDocuments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
      notes: [],
      statusTimeline: [
        { status: 'open', timestamp: new Date().toISOString(), actor: 'Current User', note: 'Case created manually' },
      ],
      linkedEvidence: linkedAlerts ? linkedAlerts.split(',').map((a, i) => ({
        id: a.trim(),
        type: 'alert' as const,
        title: `Linked Alert ${i + 1}`,
        description: `Alert ${a.trim()}`,
        date: new Date().toISOString().split('T')[0],
      })) : [],
    };

    onCreateCase(newCase);
    // Reset form
    setTitle(''); setDescription(''); setCaseType(''); setPriority('');
    setClientName(''); setAssignedTo(''); setLinkedAlerts('');
    onOpenChange(false);
    toast.success(`Case ${newCase.caseId} created successfully`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Create New Case
          </DialogTitle>
          <DialogDescription>Open a new AML/CTF investigation case</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Case Title <span className="text-red-500">*</span></label>
            <Input
              placeholder="e.g., Suspicious Structuring - [Client Name]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              placeholder="Describe the suspicious activity or compliance concern..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Case Type <span className="text-red-500">*</span></label>
              <Select value={caseType} onValueChange={(v) => setCaseType(v as CaseType)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAR Investigation">SAR Investigation</SelectItem>
                  <SelectItem value="PEP Review">PEP Review</SelectItem>
                  <SelectItem value="Sanctions Review">Sanctions Review</SelectItem>
                  <SelectItem value="Transaction Review">Transaction Review</SelectItem>
                  <SelectItem value="KYC Discrepancy">KYC Discrepancy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Priority <span className="text-red-500">*</span></label>
              <Select value={priority} onValueChange={(v) => setPriority(v as CasePriority)}>
                <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Client <span className="text-red-500">*</span></label>
            <Input
              placeholder="Client name or ID"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Assign To</label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
              <SelectContent>
                {TEAM_MEMBERS.map((member) => (
                  <SelectItem key={member} value={member}>{member}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Link Existing Alert(s)</label>
            <Input
              placeholder="Alert IDs (comma-separated, e.g., ALT-2026-001, ALT-2026-002)"
              value={linkedAlerts}
              onChange={(e) => setLinkedAlerts(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">Enter comma-separated alert IDs to link to this case</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>
            <Plus className="h-4 w-4 mr-1" /> Create Case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Case Detail View ─────────────────────────────────────────────────────────

function CaseDetailView({ caseData, onClose, onUpdateCase }: {
  caseData: AmlCase;
  onClose: () => void;
  onUpdateCase: (updatedCase: AmlCase) => void;
}) {
  const [newNote, setNewNote] = useState('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'evidence' | 'notes'>('notes');

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    const updated: AmlCase = {
      ...caseData,
      notes: [...caseData.notes, {
        id: `n-${Date.now()}`,
        author: 'Current User',
        content: newNote.trim(),
        timestamp: new Date().toISOString(),
      }],
      updatedAt: new Date().toISOString(),
    };
    onUpdateCase(updated);
    setNewNote('');
    toast.success('Note added successfully');
  };

  const handleAction = (action: 'escalate' | 'close' | 'reassign') => {
    const now = new Date().toISOString();
    let updated = { ...caseData, updatedAt: now };

    if (action === 'escalate' && caseData.status !== 'escalated') {
      updated.status = 'escalated';
      updated.statusTimeline = [...updated.statusTimeline, {
        status: 'escalated', timestamp: now, actor: 'Current User', note: 'Case escalated to senior management',
      }];
      toast.success(`Case ${caseData.caseId} escalated`);
    } else if (action === 'close' && caseData.status !== 'closed') {
      updated.status = 'closed';
      updated.closedAt = now;
      updated.statusTimeline = [...updated.statusTimeline, {
        status: 'closed', timestamp: now, actor: 'Current User', note: 'Case closed',
      }];
      toast.success(`Case ${caseData.caseId} closed`);
    } else if (action === 'reassign') {
      const otherMembers = TEAM_MEMBERS.filter(m => m !== caseData.assignedTo);
      const newAssignee = otherMembers[Math.floor(Math.random() * otherMembers.length)];
      updated.assignedTo = newAssignee;
      updated.notes = [...updated.notes, {
        id: `n-${Date.now()}`,
        author: 'Current User',
        content: `Case reassigned from ${caseData.assignedTo} to ${newAssignee}`,
        timestamp: now,
      }];
      toast.success(`Case reassigned to ${newAssignee}`);
    }

    onUpdateCase(updated);
  };

  const pConfig = priorityConfig[caseData.priority];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden"
    >
      <Card className="border-2 border-primary/20 shadow-lg">
        <div className="p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">{caseData.caseId}</span>
                <StatusBadge status={caseData.status} />
                <Badge variant="outline" className={pConfig.bg}>{pConfig.label} Priority</Badge>
                <Badge variant="outline" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                  {caseData.type}
                </Badge>
              </div>
              <h3 className="text-lg font-semibold">{caseData.title}</h3>
              <p className="text-sm text-muted-foreground">{caseData.description}</p>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Key Info Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="p-2.5 rounded-lg bg-muted/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Assigned To</p>
              <div className="flex items-center gap-1.5 mt-1">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{caseData.assignedTo}</span>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Client</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium truncate">{caseData.clientName}</span>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Created</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{new Date(caseData.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Age</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{getCaseAge(caseData.createdAt)} days</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {caseData.status !== 'escalated' && caseData.status !== 'closed' && (
              <Button variant="outline" size="sm" onClick={() => handleAction('escalate')} className="text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/30">
                <ArrowUpRight className="h-3.5 w-3.5 mr-1" /> Escalate
              </Button>
            )}
            {caseData.status !== 'closed' && (
              <Button variant="outline" size="sm" onClick={() => handleAction('close')} className="text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Close Case
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => handleAction('reassign')} className="text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30">
              <UserCheck className="h-3.5 w-3.5 mr-1" /> Reassign
            </Button>
          </div>

          <Separator className="mb-4" />

          {/* Tab Navigation */}
          <div className="flex gap-1 mb-4 bg-muted/30 rounded-lg p-1">
            {[
              { key: 'notes', label: 'Notes & Activity', icon: MessageSquare, count: caseData.notes.length },
              { key: 'timeline', label: 'Status Timeline', icon: Clock, count: caseData.statusTimeline.length },
              { key: 'evidence', label: 'Linked Evidence', icon: Link2, count: caseData.linkedEvidence.length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as 'timeline' | 'evidence' | 'notes')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  activeTab === tab.key
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                {tab.count > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">{tab.count}</Badge>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'notes' && (
                <div className="space-y-3">
                  <ScrollArea className="max-h-64">
                    <div className="space-y-3 pr-3">
                      {caseData.notes.length === 0 ? (
                        <div className="text-center py-6 text-sm text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No notes yet. Add the first note below.
                        </div>
                      ) : (
                        caseData.notes.map((note) => (
                          <div key={note.id} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium">{note.author}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(note.timestamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{note.content}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a note to the case..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      rows={2}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      className="self-end"
                      onClick={handleAddNote}
                      disabled={!newNote.trim()}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === 'timeline' && (
                <ScrollArea className="max-h-64">
                  <CaseStatusTimeline timeline={caseData.statusTimeline} />
                </ScrollArea>
              )}

              {activeTab === 'evidence' && (
                <ScrollArea className="max-h-64">
                  {caseData.linkedEvidence.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      <Link2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No linked evidence yet.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {caseData.linkedEvidence.map((ev) => (
                        <EvidenceItem key={ev.id} evidence={ev} />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CaseManagementSection() {
  const [cases, setCases] = useState<AmlCase[]>(MOCK_CASES);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Sort
  const [sortBy, setSortBy] = useState<'priority' | 'age' | 'status'>('priority');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // KPIs
  const kpis = useMemo(() => {
    const openCases = cases.filter(c => c.status === 'open').length;
    const inProgressCases = cases.filter(c => c.status === 'in_progress').length;
    const closedThisMonth = cases.filter(c => {
      if (c.status !== 'closed' || !c.closedAt) return false;
      const closedDate = new Date(c.closedAt);
      const now = new Date();
      return closedDate.getMonth() === now.getMonth() && closedDate.getFullYear() === now.getFullYear();
    }).length;
    const closedCases = cases.filter(c => c.closedAt);
    const avgResolutionDays = closedCases.length > 0
      ? Math.round(closedCases.reduce((acc, c) => {
          const created = new Date(c.createdAt).getTime();
          const closed = new Date(c.closedAt!).getTime();
          return acc + (closed - created) / 86400000;
        }, 0) / closedCases.length)
      : 0;

    return { openCases, inProgressCases, closedThisMonth, avgResolutionDays };
  }, [cases]);

  // Filtered & sorted cases
  const filteredCases = useMemo(() => {
    let result = [...cases];

    if (statusFilter !== 'all') result = result.filter(c => c.status === statusFilter);
    if (priorityFilter !== 'all') result = result.filter(c => c.priority === priorityFilter);
    if (typeFilter !== 'all') result = result.filter(c => c.type === typeFilter);
    if (assigneeFilter !== 'all') result = result.filter(c => c.assignedTo === assigneeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.caseId.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.clientName.toLowerCase().includes(q) ||
        c.assignedTo.toLowerCase().includes(q)
      );
    }

    const priorityOrder: Record<CasePriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const statusOrder: Record<CaseStatus, number> = { escalated: 0, open: 1, in_progress: 2, closed: 3 };

    result.sort((a, b) => {
      if (sortBy === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
      if (sortBy === 'age') return getCaseAge(b.createdAt) - getCaseAge(a.createdAt);
      if (sortBy === 'status') return statusOrder[a.status] - statusOrder[b.status];
      return 0;
    });

    return result;
  }, [cases, statusFilter, priorityFilter, typeFilter, assigneeFilter, searchQuery, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredCases.length / pageSize);
  const paginatedCases = filteredCases.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleUpdateCase = useCallback((updatedCase: AmlCase) => {
    setCases(prev => prev.map(c => c.id === updatedCase.id ? updatedCase : c));
  }, []);

  const handleCreateCase = useCallback((newCase: AmlCase) => {
    setCases(prev => [newCase, ...prev]);
    setCurrentPage(1);
  }, []);

  const activeFilters = [statusFilter, priorityFilter, typeFilter, assigneeFilter].filter(f => f !== 'all').length;

  // Unique assignees from cases
  const assignees = useMemo(() => [...new Set(cases.map(c => c.assignedTo))].sort(), [cases]);
  const caseTypes = useMemo(() => [...new Set(cases.map(c => c.type))].sort(), [cases]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Case Management"
        description="AML/CTF investigation workflows & SAR tracking"
        icon={Briefcase}
        actions={
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Case
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          title="Open Cases"
          value={kpis.openCases}
          icon={FolderOpen}
          color="amber"
          trend={{ value: 12, direction: 'up' }}
          invertTrend
        />
        <KPICard
          title="In Progress"
          value={kpis.inProgressCases}
          icon={Clock}
          color="blue"
          trend={{ value: 8, direction: 'down' }}
        />
        <KPICard
          title="Closed This Month"
          value={kpis.closedThisMonth}
          icon={CheckCircle2}
          color="emerald"
          trend={{ value: 25, direction: 'up' }}
        />
        <KPICard
          title="Avg Resolution"
          value={`${kpis.avgResolutionDays}d`}
          icon={Zap}
          color="slate"
          trend={{ value: 5, direction: 'down' }}
        />
      </div>

      {/* Filter Bar */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0">
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {activeFilters > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeFilters} active</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-1 w-full">
            <div className="relative flex-1 min-w-[160px] max-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search cases..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="h-8 w-[130px] text-sm"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="h-8 w-[160px] text-sm"><SelectValue placeholder="Case Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {caseTypes.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assigneeFilter} onValueChange={(v) => { setAssigneeFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="h-8 w-[150px] text-sm"><SelectValue placeholder="Assigned To" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignees</SelectItem>
                {assignees.map(a => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'priority' | 'age' | 'status')}>
              <SelectTrigger className="h-8 w-[150px] text-sm"><SelectValue placeholder="Sort by" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">Sort: Priority</SelectItem>
                <SelectItem value="age">Sort: Age</SelectItem>
                <SelectItem value="status">Sort: Status</SelectItem>
              </SelectContent>
            </Select>
            {activeFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setStatusFilter('all'); setPriorityFilter('all');
                  setTypeFilter('all'); setAssigneeFilter('all');
                  setSearchQuery(''); setCurrentPage(1);
                }}
              >
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Case List */}
      <Card className="overflow-hidden">
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-[100px_minmax(180px,1fr)_140px_90px_100px_130px_minmax(120px,140px)_100px_60px] gap-2 px-4 py-3 bg-muted/30 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <span>Case ID</span>
          <span>Title</span>
          <span>Type</span>
          <span>Priority</span>
          <span>Status</span>
          <span>Assigned To</span>
          <span>Client</span>
          <span>Created</span>
          <span>Age</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          <AnimatePresence>
            {paginatedCases.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-12 text-center text-sm text-muted-foreground"
              >
                <Eye className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>No cases match your current filters</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setStatusFilter('all'); setPriorityFilter('all');
                    setTypeFilter('all'); setAssigneeFilter('all');
                    setSearchQuery('');
                  }}
                >
                  Clear all filters
                </Button>
              </motion.div>
            ) : (
              paginatedCases.map((caseData, idx) => {
                const isExpanded = expandedCaseId === caseData.id;
                const pConf = priorityConfig[caseData.priority];

                return (
                  <motion.div
                    key={caseData.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03, duration: 0.2 }}
                  >
                    {/* Row */}
                    <div
                      className={`cursor-pointer border-l-4 ${pConf.border} hover:bg-muted/40 transition-colors duration-150`}
                      onClick={() => setExpandedCaseId(isExpanded ? null : caseData.id)}
                    >
                      {/* Desktop Row */}
                      <div className="hidden md:grid grid-cols-[100px_minmax(180px,1fr)_140px_90px_100px_130px_minmax(120px,140px)_100px_60px] gap-2 px-4 py-3 items-center text-sm table-row-hover">
                        <span className="font-mono text-xs text-muted-foreground">{caseData.caseId}</span>
                        <div className="min-w-0">
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="font-medium truncate cursor-default">{caseData.title}</p>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="text-xs">{caseData.title}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {caseData.linkedAlerts.length > 0 && (
                            <p className="text-[10px] text-muted-foreground">{caseData.linkedAlerts.length} linked alert{caseData.linkedAlerts.length > 1 ? 's' : ''}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{caseData.type.replace(' Review', '').replace(' Investigation', '')}</span>
                        <Badge variant="outline" className={`${pConf.bg} text-[10px] h-5 w-fit`}>{pConf.label}</Badge>
                        <StatusBadge status={caseData.status} />
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                            {caseData.assignedTo.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span className="text-xs truncate">{caseData.assignedTo}</span>
                        </div>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground truncate cursor-default">{caseData.clientName}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">{caseData.clientName}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="text-xs text-muted-foreground">{new Date(caseData.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                        <span className="text-xs font-medium">{getCaseAge(caseData.createdAt)}d</span>
                      </div>

                      {/* Mobile Row */}
                      <div className="md:hidden px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-mono text-[10px] text-muted-foreground">{caseData.caseId}</span>
                              <StatusBadge status={caseData.status} />
                              <Badge variant="outline" className={`${pConf.bg} text-[10px] h-4`}>{pConf.label}</Badge>
                            </div>
                            <p className="text-sm font-medium">{caseData.title}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>{caseData.type}</span>
                              <span>{caseData.assignedTo}</span>
                              <span>{getCaseAge(caseData.createdAt)}d old</span>
                            </div>
                          </div>
                          <div className="shrink-0">
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </div>
                      </div>

                      {/* Desktop expand indicator */}
                      <div className="hidden md:flex items-center justify-center py-0">
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />}
                      </div>
                    </div>

                    {/* Expanded Detail */}
                    <AnimatePresence>
                      {isExpanded && (
                        <CaseDetailView
                          caseData={caseData}
                          onClose={() => setExpandedCaseId(null)}
                          onUpdateCase={handleUpdateCase}
                        />
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {/* Pagination */}
        {filteredCases.length > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <p className="text-xs font-medium text-foreground">
              Showing <span className="text-primary font-semibold">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredCases.length)}</span> of <span className="font-semibold">{filteredCases.length}</span> cases
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  variant={page === currentPage ? 'default' : 'outline'}
                  size="icon"
                  className="h-7 w-7 text-xs"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Case Statistics Chart */}
      <CaseStatisticsChart cases={cases} />

      {/* Create Case Dialog */}
      <CreateCaseDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreateCase={handleCreateCase}
      />
    </div>
  );
}
