'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useDocuments, useClients, useAnalyzeDocument } from '@/hooks/useApi';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { KPICard } from '@/components/shared/KPICard';
import {
  FileSearch,
  Upload,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Download,
  Filter,
  ShieldCheck,
  AlertTriangle,
  FileCheck2,
  FolderOpen,
  X,
  RotateCcw,
  Search,
  FileSpreadsheet,
  Bug,
  Eye,
  Lock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from '@/components/ui/pagination';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDocType(type: string): string {
  return (type ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function riskLevelFromScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'low';
  if (score > 0.5) return 'critical';
  if (score > 0.3) return 'high';
  if (score > 0.15) return 'medium';
  return 'low';
}

function scoreLevelFromValue(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'low';
  if (score > 0.4) return 'critical';
  if (score > 0.25) return 'high';
  if (score > 0.1) return 'medium';
  return 'low';
}

/** Render JSON analysis result in a structured, readable way */
function AnalysisResultViewer({ result }: { result: unknown }) {
  const parsed = useMemo(() => {
    try {
      return typeof result === 'string' ? JSON.parse(result) : result;
    } catch {
      return null;
    }
  }, [result]);

  if (!parsed || typeof parsed !== 'object') {
    return (
      <p className="text-xs text-muted-foreground italic">No structured analysis data available</p>
    );
  }

  // Try to render known fields in a structured way
  const entries = Object.entries(parsed as Record<string, unknown>);

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => (
        <div key={key} className="border rounded-lg p-3 bg-background">
          <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 tracking-wider">
            {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}
          </h5>
          {renderValue(value, 0)}
        </div>
      ))}
    </div>
  );
}

function renderValue(value: unknown, depth: number): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-xs text-muted-foreground italic">—</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <Badge variant="outline" className={value ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 text-xs' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 text-xs'}>
        {value ? 'Yes' : 'No'}
      </Badge>
    );
  }
  if (typeof value === 'number') {
    const isScore = value >= 0 && value <= 1;
    return (
      <span className="text-xs font-mono font-medium">
        {isScore ? `${(value * 100).toFixed(1)}%` : value.toLocaleString()}
      </span>
    );
  }
  if (typeof value === 'string') {
    // Try to parse as JSON
    try {
      const inner = JSON.parse(value);
      if (typeof inner === 'object') return renderValue(inner, depth + 1);
    } catch {
      // not JSON, render as string
    }
    return <span className="text-xs">{value}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-xs text-muted-foreground italic">Empty list</span>;
    return (
      <ul className="space-y-1 ml-2">
        {value.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="text-muted-foreground text-xs mt-0.5">•</span>
            <span className="text-xs">{renderValue(item, depth + 1)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return (
      <div className={depth > 0 ? 'ml-3 border-l-2 border-muted pl-2' : ''}>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {Object.entries(obj).map(([k, v]) => (
            <React.Fragment key={k}>
              <span className="text-xs font-medium text-muted-foreground">{k}:</span>
              <span className="text-xs">{renderValue(v, depth + 1)}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }
  return <span className="text-xs">{String(value)}</span>;
}

// ── Main Component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const DOC_TYPE_OPTIONS = [
  { value: 'identity_proof', label: 'Identity Proof' },
  { value: 'address_proof', label: 'Address Proof' },
  { value: 'corporate_registry', label: 'Corporate Registry' },
  { value: 'trust_deed', label: 'Trust Deed' },
  { value: 'other', label: 'Other' },
];
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'analyzing', label: 'Analyzing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

interface DocumentEngineSectionProps {
  onClientSelect?: (clientId: string) => void;
}

export function DocumentEngineSection({ onClientSelect }: DocumentEngineSectionProps) {
  // ── Document query with filters & pagination ──
  const [page, setPage] = useState(1);
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientIdFilter, setClientIdFilter] = useState('');

  const { data: docsData, isLoading: docsLoading, isError: docsError } = useDocuments({
    page,
    limit: PAGE_SIZE,
    documentType: docTypeFilter || undefined,
    analysisStatus: statusFilter || undefined,
    clientId: clientIdFilter || undefined,
  });

  // Client list for upload form
  const { data: clientsData } = useClients({ limit: 100 });
  const clients = (clientsData?.clients ?? []) as Array<Record<string, unknown>>;

  // Analysis mutation
  const analyzeMutation = useAnalyzeDocument();

  // ── Upload state ──
  const [selectedClient, setSelectedClient] = useState('');
  const [docType, setDocType] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // ── Table interaction state ──
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<Record<string, unknown> | null>(null);

  // ── Derived data ──
  const documents = (docsData?.documents ?? []) as Array<Record<string, unknown>>;
  const pagination = docsData?.pagination ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  // ── Summary stats from current document list ──
  const stats = useMemo(() => {
    const total = pagination.total;
    const analyzed = documents.filter((d) => (d.analysisStatus as string) === 'completed').length;
    const highRisk = documents.filter((d) => {
      const s = d.overallRiskScore as number | null;
      return s !== null && s !== undefined && s > 0.3;
    }).length;
    const sanitized = documents.filter((d) => d.sanitized === true).length;
    return { total, analyzed, highRisk, sanitized };
  }, [documents, pagination.total]);

  // ── Handlers ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const handleUpload = async () => {
    if (!selectedClient || !docType) {
      toast.error('Please select a client and document type');
      return;
    }
    const formData = new FormData();
    if (file) formData.append('file', file);
    formData.append('clientId', selectedClient);
    formData.append('documentType', docType);

    try {
      await analyzeMutation.mutateAsync(formData);
      toast.success('Document uploaded and analysis started');
      setFile(null);
      setSelectedClient('');
      setDocType('');
    } catch {
      toast.error('Failed to analyze document');
    }
  };

  const clearFilters = () => {
    setDocTypeFilter('');
    setStatusFilter('');
    setClientIdFilter('');
    setPage(1);
  };

  const hasActiveFilters = docTypeFilter || statusFilter || clientIdFilter;

  // ── CSV Export ──
  const exportCSV = useCallback(() => {
    if (documents.length === 0) {
      toast.error('No documents to export');
      return;
    }

    const headers = [
      'Document ID',
      'File Name',
      'Client',
      'Client Risk',
      'Document Type',
      'Forgery Score',
      'Injection Score',
      'Stego Score',
      'Overall Risk',
      'Status',
      'Sanitized',
      'Upload Date',
    ];

    const rows = documents.map((doc) => {
      const client = doc.client as Record<string, unknown> | null;
      return [
        doc.documentId ?? doc.id ?? '',
        doc.fileName ?? '',
        client?.fullName ?? '',
        client?.riskRating ?? '',
        formatDocType(doc.documentType as string ?? ''),
        (doc.visualForgeryScore as number)?.toFixed(3) ?? '',
        (doc.promptInjectionScore as number)?.toFixed(3) ?? '',
        (doc.steganographyScore as number)?.toFixed(3) ?? '',
        (doc.overallRiskScore as number)?.toFixed(3) ?? '',
        formatDocType(doc.analysisStatus as string ?? ''),
        doc.sanitized ? 'Yes' : 'No',
        doc.uploadDate ?? doc.createdAt ?? '',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `documents-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${documents.length} documents to CSV`);
  }, [documents]);

  // ── Score badges ──
  const getScoreBadge = (score: number | undefined | null) => {
    if (score === undefined || score === null) return <span className="text-muted-foreground text-xs">—</span>;
    const level = scoreLevelFromValue(score);
    return <RiskBadge level={level} score={score} />;
  };

  const getOverallRisk = (score: number | undefined | null) => {
    if (score === undefined || score === null) return <RiskBadge level="low" />;
    const level = riskLevelFromScore(score);
    return <RiskBadge level={level} />;
  };

  const getClientInfo = (doc: Record<string, unknown>) => {
    const client = doc.client as Record<string, unknown> | null;
    if (!client) return { name: '—', riskRating: 'low' };
    return {
      name: (client.fullName as string) ?? '—',
      riskRating: (client.riskRating as string) ?? 'low',
    };
  };

  // ── Render ──
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Document Detection Engine"
        description="Upload and analyze documents for forgery, injection, and steganography"
        icon={FileSearch}
        actions={
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={documents.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
        }
      />

      {/* ── Summary Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Total Documents"
          value={stats.total}
          icon={FolderOpen}
          color="slate"
        />
        <KPICard
          title="Analyzed"
          value={stats.analyzed}
          icon={FileCheck2}
          color="emerald"
        />
        <KPICard
          title="High Risk"
          value={stats.highRisk}
          icon={AlertTriangle}
          color="red"
        />
        <KPICard
          title="Sanitized"
          value={stats.sanitized}
          icon={ShieldCheck}
          color="amber"
        />
      </div>

      {/* ── Upload Panel ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4 text-muted-foreground" />
            Upload Document for Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Client</label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
                <SelectContent>
                  {clients.map((c: Record<string, unknown>) => (
                    <SelectItem key={c.id as string} value={c.id as string}>
                      {c.fullName as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Document Type</label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">&nbsp;</label>
              <Button
                onClick={handleUpload}
                disabled={analyzeMutation.isPending || !selectedClient || !docType}
                className="w-full"
              >
                {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Analyze
              </Button>
            </div>
          </div>

          {/* Drag and Drop Area */}
          <div
            className={`mt-4 border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {file ? file.name : 'Drag & drop a file here, or click to browse'}
            </p>
            <Input
              type="file"
              className="hidden"
              id="file-upload"
              onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
            />
            <div className="flex items-center justify-center gap-2 mt-2">
              <Button variant="ghost" size="sm" onClick={() => document.getElementById('file-upload')?.click()}>
                Browse Files
              </Button>
              {file && (
                <Button variant="ghost" size="sm" onClick={() => setFile(null)} className="text-muted-foreground">
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Filters Bar ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs">
                Active
              </Badge>
            )}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="ml-auto text-xs h-7" onClick={clearFilters}>
                <RotateCcw className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Document Type</label>
              <Select value={docTypeFilter} onValueChange={(v) => { setDocTypeFilter(v === '__all__' ? '' : v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  {DOC_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Analysis Status</label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === '__all__' ? '' : v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Client</label>
              <Select value={clientIdFilter} onValueChange={(v) => { setClientIdFilter(v === '__all__' ? '' : v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Clients</SelectItem>
                  {clients.map((c: Record<string, unknown>) => (
                    <SelectItem key={c.id as string} value={c.id as string}>
                      {c.fullName as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Analysis Results Table ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Analysis Results</CardTitle>
            <span className="text-xs text-muted-foreground">
              {pagination.total} document{pagination.total !== 1 ? 's' : ''} total
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Loading state */}
          {docsLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {docsError && (
            <div className="text-center py-12">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-red-400" />
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Failed to load documents</p>
              <p className="text-xs text-muted-foreground mt-1">Please try refreshing the page</p>
            </div>
          )}

          {/* Empty state */}
          {!docsLoading && !docsError && documents.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16"
            >
              <div className="relative inline-block mb-6">
                <div className="w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                  <FileText className="h-10 w-10 text-muted-foreground/40" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Search className="h-4 w-4 text-primary/60" />
                </div>
              </div>
              <h3 className="text-base font-semibold mb-2">
                {hasActiveFilters ? 'No matching documents' : 'No documents analyzed yet'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                {hasActiveFilters
                  ? 'Try adjusting your filters or clearing them to see all documents.'
                  : 'Upload a document using the panel above to start the detection analysis pipeline. The engine will check for visual forgery, prompt injection, and steganographic content.'}
              </p>
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Clear Filters
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Bug className="h-3.5 w-3.5" />
                    Forgery Detection
                  </div>
                  <Separator orientation="vertical" className="h-3" />
                  <div className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    Injection Analysis
                  </div>
                  <Separator orientation="vertical" className="h-3" />
                  <div className="flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" />
                    Stego Scan
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Document table */}
          {!docsLoading && !docsError && documents.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Document</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-center">Forgery</TableHead>
                      <TableHead className="text-center">Injection</TableHead>
                      <TableHead className="text-center">Stego</TableHead>
                      <TableHead className="text-center">Risk</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc: Record<string, unknown>) => {
                      const docId = doc.id as string;
                      const isExpanded = expandedRow === docId;
                      const clientInfo = getClientInfo(doc);

                      return (
                        <React.Fragment key={docId}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => setExpandedRow(isExpanded ? null : docId)}
                          >
                            <TableCell>
                              <motion.div
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <ChevronDown className="h-3 w-3" />
                              </motion.div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <FileSpreadsheet className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <div>
                                  <p className="font-medium text-sm">{(doc.fileName as string) ?? 'Unknown'}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {(doc.fileSize as number) ? `${((doc.fileSize as number) / 1024).toFixed(1)} KB` : ''}
                                    {(doc.mimeType as string) ? ` • ${doc.mimeType as string}` : ''}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p
                                  className="text-sm cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                                  onClick={(e) => {
                                    const c = doc.client as Record<string, unknown> | null;
                                    if (c?.id) {
                                      e.stopPropagation();
                                      onClientSelect?.(c.id as string);
                                    }
                                  }}
                                >
                                  {clientInfo.name}
                                </p>
                                <RiskBadge level={clientInfo.riskRating} />
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">{formatDocType(doc.documentType as string)}</TableCell>
                            <TableCell className="text-center">{getScoreBadge(doc.visualForgeryScore as number | null)}</TableCell>
                            <TableCell className="text-center">{getScoreBadge(doc.promptInjectionScore as number | null)}</TableCell>
                            <TableCell className="text-center">{getScoreBadge(doc.steganographyScore as number | null)}</TableCell>
                            <TableCell className="text-center">{getOverallRisk(doc.overallRiskScore as number | null)}</TableCell>
                            <TableCell><StatusBadge status={(doc.analysisStatus as string) ?? 'pending'} /></TableCell>
                          </TableRow>
                          <AnimatePresence>
                            {isExpanded && (
                              <TableRow>
                                <TableCell colSpan={9} className="p-0">
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="px-6 py-4 bg-muted/20 border-t border-b"
                                  >
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <Bug className="h-3.5 w-3.5 text-red-500" />
                                          <h4 className="font-semibold text-xs uppercase text-muted-foreground tracking-wider">Visual Forgery</h4>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                            <div
                                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all"
                                              style={{ width: `${((doc.visualForgeryScore as number) ?? 0) * 100}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-mono w-10 text-right">
                                            {(((doc.visualForgeryScore as number) ?? 0) * 100).toFixed(0)}%
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">Font anomalies, metadata inconsistencies, pixel artefacts</p>
                                      </div>
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <Eye className="h-3.5 w-3.5 text-amber-500" />
                                          <h4 className="font-semibold text-xs uppercase text-muted-foreground tracking-wider">Prompt Injection</h4>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                            <div
                                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all"
                                              style={{ width: `${((doc.promptInjectionScore as number) ?? 0) * 100}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-mono w-10 text-right">
                                            {(((doc.promptInjectionScore as number) ?? 0) * 100).toFixed(0)}%
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">Zero-width characters, hidden layers, embedded directives</p>
                                      </div>
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <Lock className="h-3.5 w-3.5 text-purple-500" />
                                          <h4 className="font-semibold text-xs uppercase text-muted-foreground tracking-wider">Steganography</h4>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                            <div
                                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all"
                                              style={{ width: `${((doc.steganographyScore as number) ?? 0) * 100}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-mono w-10 text-right">
                                            {(((doc.steganographyScore as number) ?? 0) * 100).toFixed(0)}%
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">LSB signatures, whitespace patterns, hidden content</p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3 mt-4 pt-3 border-t">
                                      <Button variant="outline" size="sm" onClick={() => setDetailModal(doc)}>
                                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                                        View Full Analysis
                                      </Button>
                                      {doc.sanitized && (
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 text-xs">
                                          <ShieldCheck className="h-3 w-3 mr-1" />
                                          Sanitized
                                        </Badge>
                                      )}
                                    </div>
                                  </motion.div>
                                </TableCell>
                              </TableRow>
                            )}
                          </AnimatePresence>
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} — showing {documents.length} of {pagination.total}
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          className={pagination.page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                          className={pagination.page >= pagination.totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Detail Modal ── */}
      <Dialog open={!!detailModal} onOpenChange={() => setDetailModal(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              Document Analysis Detail
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh]">
            {detailModal && (
              <div className="space-y-5">
                {/* Header info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Document</span>
                    <p className="font-medium">{detailModal.fileName as string}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Client</span>
                    <p className="font-medium">{getClientInfo(detailModal).name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Type</span>
                    <p>{formatDocType(detailModal.documentType as string)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Status:</span>
                    <StatusBadge status={(detailModal.analysisStatus as string) ?? 'pending'} />
                  </div>
                </div>

                <Separator />

                {/* Score Breakdown */}
                <div className="border rounded-lg p-4 bg-muted/30">
                  <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-3 tracking-wider">Score Breakdown</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 rounded-lg bg-background border">
                      <div className="text-lg font-bold">{((detailModal.visualForgeryScore as number) ?? 0).toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground mb-1">Visual Forgery</div>
                      {getScoreBadge(detailModal.visualForgeryScore as number | null)}
                    </div>
                    <div className="text-center p-3 rounded-lg bg-background border">
                      <div className="text-lg font-bold">{((detailModal.promptInjectionScore as number) ?? 0).toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground mb-1">Prompt Injection</div>
                      {getScoreBadge(detailModal.promptInjectionScore as number | null)}
                    </div>
                    <div className="text-center p-3 rounded-lg bg-background border">
                      <div className="text-lg font-bold">{((detailModal.steganographyScore as number) ?? 0).toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground mb-1">Steganography</div>
                      {getScoreBadge(detailModal.steganographyScore as number | null)}
                    </div>
                  </div>
                </div>

                {/* Overall Risk */}
                <div className="flex items-center gap-2">
                  {getOverallRisk(detailModal.overallRiskScore as number | null)}
                  <span className="text-xs text-muted-foreground">Overall Risk Assessment</span>
                  {detailModal.sanitized && (
                    <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 text-xs">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      Sanitized
                    </Badge>
                  )}
                </div>

                <Separator />

                {/* Analysis Result — structured rendering */}
                {detailModal.analysisResult && (
                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-3 tracking-wider">Analysis Details</h4>
                    <AnalysisResultViewer result={detailModal.analysisResult} />
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
