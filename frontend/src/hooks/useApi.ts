'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Session } from 'supertokens-auth-react/recipe/session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = await Session.getAccessToken();

  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Dashboard
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiFetch<{
      metrics: {
        totalClients: number;
        highRiskClients: number;
        pendingOnboarding: number;
        openAlerts: number;
        criticalAlerts: number;
        reportsFiled: { smr: number; ttr: number; iftiE: number };
        avgRiskScore: number;
        documentsAnalyzed: number;
      };
      recentActivity: Array<{
        id: string;
        action: string;
        entityType: string;
        entityId: string | null;
        userId: string | null;
        details: Record<string, unknown> | null;
        timestamp: string;
      }>;
    }>('/dashboard/stats'),
    refetchInterval: 30000,
  });
}

// Clients
export function useClients(params?: { risk?: string; status?: string; entityType?: string; search?: string; page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.risk) searchParams.set('risk', params.risk);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.entityType) searchParams.set('entityType', params.entityType);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  return useQuery({
    queryKey: ['clients', params],
    queryFn: () => apiFetch<{
      clients: Array<Record<string, unknown>>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/clients?${searchParams.toString()}`),
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch('/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
}

// Documents
export function useDocuments(params?: { clientId?: string; documentType?: string; analysisStatus?: string; page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.clientId) searchParams.set('clientId', params.clientId);
  if (params?.documentType) searchParams.set('documentType', params.documentType);
  if (params?.analysisStatus) searchParams.set('analysisStatus', params.analysisStatus);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  return useQuery({
    queryKey: ['documents', params],
    queryFn: () => apiFetch<{
      documents: Array<Record<string, unknown>>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/documents?${searchParams.toString()}`),
  });
}

export function useAnalyzeDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiFetch('/documents/analyze', { method: 'POST', body: formData }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
}

// Transactions
export function useTransactions(params?: { clientId?: string; flagged?: string; minRisk?: string; maxRisk?: string; startDate?: string; endDate?: string; transactionType?: string; page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.clientId) searchParams.set('clientId', params.clientId);
  if (params?.flagged) searchParams.set('flagged', params.flagged);
  if (params?.minRisk) searchParams.set('minRisk', params.minRisk);
  if (params?.maxRisk) searchParams.set('maxRisk', params.maxRisk);
  if (params?.startDate) searchParams.set('startDate', params.startDate);
  if (params?.endDate) searchParams.set('endDate', params.endDate);
  if (params?.transactionType) searchParams.set('transactionType', params.transactionType);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  return useQuery({
    queryKey: ['transactions', params],
    queryFn: () => apiFetch<{
      transactions: Array<Record<string, unknown>>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/transactions?${searchParams.toString()}`),
  });
}

// Monitoring Rules
export function useMonitoringRules(params?: { ruleType?: string; enabled?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.ruleType) searchParams.set('ruleType', params.ruleType);
  if (params?.enabled) searchParams.set('enabled', params.enabled);

  return useQuery({
    queryKey: ['monitoring-rules', params],
    queryFn: () => apiFetch<{ rules: Array<Record<string, unknown>> }>(`/monitoring/rules?${searchParams.toString()}`),
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch('/monitoring/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['monitoring-rules'] }); },
  });
}

// Alerts
export function useAlerts(params?: { status?: string; severity?: string; assignedTo?: string; startDate?: string; endDate?: string; alertType?: string; page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.severity) searchParams.set('severity', params.severity);
  if (params?.assignedTo) searchParams.set('assignedTo', params.assignedTo);
  if (params?.startDate) searchParams.set('startDate', params.startDate);
  if (params?.endDate) searchParams.set('endDate', params.endDate);
  if (params?.alertType) searchParams.set('alertType', params.alertType);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  return useQuery({
    queryKey: ['alerts', params],
    queryFn: () => apiFetch<{
      alerts: Array<Record<string, unknown>>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/alerts?${searchParams.toString()}`),
  });
}

export function useUpdateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/alerts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
}

// UBO
export function useUBO(entityId: string | null) {
  return useQuery({
    queryKey: ['ubo', entityId],
    queryFn: () => apiFetch<{
      entityId: string;
      entityName: string;
      entityType: string;
      ultimateBeneficialOwners: Array<Record<string, unknown>>;
      graph: { nodes: Array<Record<string, string>>; edges: Array<Record<string, unknown>> };
      totalUBOsFound: number;
      maxDepthSearched: number;
    }>(`/ubo/calculate?entityId=${entityId}`),
    enabled: !!entityId,
  });
}

// Onboarding
export function useOnboardingStatus(caseId: string | null) {
  return useQuery({
    queryKey: ['onboarding', caseId],
    queryFn: () => apiFetch<{
      case: Record<string, unknown>;
      workflow: {
        currentState: string;
        progressPercent: number;
        stepsCompleted: number;
        totalSteps: number;
        allSteps: string[];
        isCompleted: boolean;
        isRejected: boolean;
      };
      identityResult: Record<string, unknown> | null;
      sanctionsResult: Record<string, unknown> | null;
      kybResult: Record<string, unknown> | null;
    }>(`/onboarding/${caseId}/status`),
    enabled: !!caseId,
  });
}

export function useInitiateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { clientId: string }) =>
      apiFetch('/onboarding/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
}

export function useAdvanceOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: Record<string, unknown> }) =>
      apiFetch(`/onboarding/${id}/advance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['onboarding'] }); qc.invalidateQueries({ queryKey: ['clients'] }); },
  });
}

// Reports
export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, data }: { type: string; data: Record<string, unknown> }) =>
      apiFetch(`/reports/generate/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
}

export function useReport(id: string | null) {
  return useQuery({
    queryKey: ['reports', id],
    queryFn: () => apiFetch<{ report: Record<string, unknown> }>(`/reports/${id}`),
    enabled: !!id,
  });
}

export function useUpdateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/reports/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports'] }); },
  });
}

// Audit
export function useAuditLogs(params?: { action?: string; entityType?: string; userId?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.action) searchParams.set('action', params.action);
  if (params?.entityType) searchParams.set('entityType', params.entityType);
  if (params?.userId) searchParams.set('userId', params.userId);
  if (params?.startDate) searchParams.set('startDate', params.startDate);
  if (params?.endDate) searchParams.set('endDate', params.endDate);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  return useQuery({
    queryKey: ['audit', params],
    queryFn: () => apiFetch<{
      logs: Array<Record<string, unknown>>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/audit?${searchParams.toString()}`),
  });
}

// Governance
export function useGovernanceMetrics(days?: number) {
  return useQuery({
    queryKey: ['governance', days],
    queryFn: () => apiFetch<{
      riskAppetite: {
        totalClients: number;
        highRiskClients: number;
        highRiskPercentage: number;
        riskAppetiteThreshold: number;
        withinAppetite: boolean;
      };
      alertVelocity: Array<{ date: string; count: number }>;
      alertSummary: {
        byStatus: Array<{ status: string; count: number }>;
        bySeverity: Array<{ severity: string; count: number }>;
        avgResolutionHours: number;
        totalInPeriod: number;
      };
      complianceSignOff: {
        reportsNeedingApproval: number;
        reportsPendingSubmission: number;
        reportsSubmitted: number;
        totalReports: number;
      };
      onboardingPipeline: Array<{ status: string; count: number }>;
      historicalMetrics: Array<Record<string, unknown>>;
      periodDays: number;
    }>(`/governance/metrics?days=${days ?? 30}`, {
      // Governance endpoints require specific roles — this request will 403 if user lacks permissions
      // Handled by TanStack Query's isError state
    }),
  });
}

// Search
export function useGlobalSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => apiFetch<{
      results: Array<{
        type: string;
        id: string;
        label: string;
        sublabel: string;
        extra: string;
        section: string;
      }>;
    }>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 5000,
  });
}

// Seed
export function useSeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/seed', { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries(); },
  });
}

// AI Chat
export function useAIChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { message: string; context?: string; history?: Array<{role: string; content: string}> }) =>
      apiFetch<{ response: string; timestamp: string }>('/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-chat'] }); },
  });
}

// Reports list
export function useReportsList(params?: { status?: string; reportType?: string; page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.reportType) searchParams.set('reportType', params.reportType);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  return useQuery({
    queryKey: ['reports', 'list', params],
    queryFn: () => apiFetch<{
      reports: Array<Record<string, unknown>>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/reports?${searchParams.toString()}`),
  });
}

// ── Case Management ────────────────────────────────────────────────────────────

/** Helpers to translate between the backend's snake_case payloads and the
 *  camelCase shape used throughout the UI.  Pydantic emits `assigned_to`,
 *  `linked_alerts`, etc.; React code uses `assignedTo`, `linkedAlerts`, …
 */
type AmlCaseRow = {
  id: string;
  case_id: string;
  title: string;
  description?: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'escalated' | 'closed';
  assigned_to: string;
  client_id?: string;
  client_name: string;
  linked_alerts: string[];
  linked_documents: string[];
  linked_evidence?: Array<{
    id: string;
    type: string;
    title: string;
    description?: string;
    date: string;
  }>;
  notes: Array<{ id: string; author: string; content: string; timestamp: string }>;
  status_timeline: Array<{ status: string; timestamp: string; actor: string; note?: string }>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

function toAmlCase(row: AmlCaseRow): AmlCase {
  return {
    id: row.id,
    caseId: row.case_id,
    title: row.title,
    description: row.description ?? '',
    type: row.type,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to,
    clientId: row.client_id ?? '',
    clientName: row.client_name,
    linkedAlerts: row.linked_alerts ?? [],
    linkedDocuments: row.linked_documents ?? [],
    linkedEvidence: row.linked_evidence ?? [],
    notes: row.notes ?? [],
    statusTimeline: row.status_timeline ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

export interface CaseNote {
  id: string;
  author: string;
  content: string;
  timestamp: string;
}

export interface StatusChange {
  status: string;
  timestamp: string;
  actor: string;
  note?: string;
}

export interface LinkedEvidence {
  id: string;
  type: string;
  title: string;
  description?: string;
  date: string;
}

export interface AmlCase {
  id: string;
  caseId: string;
  title: string;
  description?: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'escalated' | 'closed';
  assignedTo: string;
  clientId?: string;
  clientName: string;
  linkedAlerts: string[];
  linkedDocuments: string[];
  linkedEvidence?: LinkedEvidence[];
  notes: CaseNote[];
  statusTimeline: StatusChange[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface CaseListResponse {
  cases: AmlCase[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  assignees: string[];
}

export interface CreateCasePayload {
  title: string;
  description?: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  client_id?: string;
  client_name: string;
  assigned_to?: string;
  linked_alerts?: string[];
  linked_documents?: string[];
}

export interface UpdateCasePayload {
  title?: string;
  description?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  status?: 'open' | 'in_progress' | 'escalated' | 'closed';
  assigned_to?: string;
  linked_alerts?: string[];
  linked_documents?: string[];
  note?: string;
}

export function useCases(params?: {
  status?: string;
  priority?: string;
  caseType?: string;
  assignedTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.priority) searchParams.set('priority', params.priority);
  if (params?.caseType) searchParams.set('caseType', params.caseType);
  if (params?.assignedTo) searchParams.set('assignedTo', params.assignedTo);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('page_size', String(params.pageSize));

  return useQuery({
    queryKey: ['cases', params],
    queryFn: async () => {
      const raw = await apiFetch<{
        cases: AmlCaseRow[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
        assignees: string[];
      }>(`/cases?${searchParams.toString()}`);
      return {
        cases: raw.cases.map(toAmlCase),
        pagination: raw.pagination,
        assignees: raw.assignees,
      };
    },
  });
}

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateCasePayload) => {
      const raw = await apiFetch<AmlCaseRow>('/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return toAmlCase(raw);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cases'] }); qc.invalidateQueries({ queryKey: ['audit-changes'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
}

export function useUpdateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateCasePayload }) => {
      const raw = await apiFetch<AmlCaseRow>(`/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return toAmlCase(raw);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cases'] }); qc.invalidateQueries({ queryKey: ['audit-changes'] }); },
  });
}

export function useDeleteCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/cases/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cases'] }); qc.invalidateQueries({ queryKey: ['audit-changes'] }); },
  });
}

export function useAddCaseNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, author, content }: { id: string; author: string; content: string }) => {
      const raw = await apiFetch<AmlCaseRow>(`/cases/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, content }),
      });
      return toAmlCase(raw);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cases'] }); qc.invalidateQueries({ queryKey: ['audit-changes'] }); },
  });
}

// ── Compliance Tasks ──────────────────────────────────────────────────────────

type ComplianceTaskRow = {
  id: string;
  title: string;
  description?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'completed';
  due_date: string;
  assignee: string;
  category: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function toComplianceTask(row: ComplianceTaskRow): ComplianceTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date,
    assignee: row.assignee,
    category: row.category,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ComplianceTask {
  id: string;
  title: string;
  description?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'completed';
  dueDate: string;
  assignee: string;
  category: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListResponse {
  tasks: ComplianceTask[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  assignees: string[];
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  due_date: string;
  category: string;
  assignee?: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  status?: 'active' | 'completed';
  due_date?: string;
  assignee?: string;
  category?: string;
}

export function useTasks(params?: {
  status?: string;
  priority?: string;
  category?: string;
  assignee?: string;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.priority) searchParams.set('priority', params.priority);
  if (params?.category) searchParams.set('category', params.category);
  if (params?.assignee) searchParams.set('assignee', params.assignee);
  if (params?.overdueOnly) searchParams.set('overdue_only', 'true');
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('page_size', String(params.pageSize));

  return useQuery({
    queryKey: ['tasks', params],
    queryFn: async () => {
      const raw = await apiFetch<{
        tasks: ComplianceTaskRow[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
        assignees: string[];
      }>(`/tasks?${searchParams.toString()}`);
      return {
        tasks: raw.tasks.map(toComplianceTask),
        pagination: raw.pagination,
        assignees: raw.assignees,
      };
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTaskPayload) => {
      const raw = await apiFetch<ComplianceTaskRow>('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return toComplianceTask(raw);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['audit-changes'] }); },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTaskPayload }) => {
      const raw = await apiFetch<ComplianceTaskRow>(`/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return toComplianceTask(raw);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['audit-changes'] }); },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['audit-changes'] }); },
  });
}

// ── Audit Changes (Settings → Audit tab) ─────────────────────────────────────

type AuditChangeRow = {
  id: string;
  user: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes: Record<string, unknown>;
  timestamp: string;
};

function toAuditChange(row: AuditChangeRow): AuditChangeEntry {
  return {
    id: row.id,
    user: row.user,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    changes: row.changes,
    timestamp: row.timestamp,
  };
}

export interface AuditChangeEntry {
  id: string;
  user: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, unknown>;
  timestamp: string;
}

export interface AuditChangeListResponse {
  entries: AuditChangeEntry[];
  users: string[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function useAuditChanges(params?: {
  user?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  page?: number;
  pageSize?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.user) searchParams.set('user', params.user);
  if (params?.action) searchParams.set('action', params.action);
  if (params?.entityType) searchParams.set('entity_type', params.entityType);
  if (params?.entityId) searchParams.set('entity_id', params.entityId);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('page_size', String(params.pageSize));

  return useQuery({
    queryKey: ['audit-changes', params],
    queryFn: async () => {
      const raw = await apiFetch<{
        entries: AuditChangeRow[];
        users: string[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/audit-changes?${searchParams.toString()}`);
      return {
        entries: raw.entries.map(toAuditChange),
        users: raw.users,
        pagination: raw.pagination,
      };
    },
  });
}

// ── Integration Providers (Settings → API Integration) ────────────────────────

type ProviderStatusRow = {
  name: string;
  status: string;
  last_sync: string | null;
  description: string;
  healthy: boolean;
};

function toProviderStatus(row: ProviderStatusRow): ProviderStatus {
  return {
    name: row.name,
    status: row.status as ProviderStatus['status'],
    lastSync: row.last_sync,
    description: row.description,
    healthy: row.healthy,
  };
}

export interface ProviderStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'degraded';
  lastSync: string | null;
  description: string;
  healthy: boolean;
}

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      const raw = await apiFetch<ProviderStatusRow[]>('/providers');
      return raw.map(toProviderStatus);
    },
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; status: string; description?: string }) => {
      const raw = await apiFetch<ProviderStatusRow>('/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return toProviderStatus(raw);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); },
  });
}

// ── Service Health (Settings → System Health) ────────────────────────────────

type ServiceStatusRow = {
  name: string;
  status: string;
  uptime_pct: number;
  response_time_ms: number;
  last_incident: string;
  response_history: number[];
  healthy: boolean;
  checked_at: string;
};

function toServiceStatus(row: ServiceStatusRow): ServiceStatus {
  return {
    name: row.name,
    status: row.status as ServiceStatus['status'],
    uptimePct: row.uptime_pct,
    responseTimeMs: row.response_time_ms,
    lastIncident: row.last_incident,
    responseHistory: row.response_history,
    healthy: row.healthy,
    checkedAt: row.checked_at,
  };
}

export interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  uptimePct: number;
  responseTimeMs: number;
  lastIncident: string;
  responseHistory: number[];
  healthy: boolean;
  checkedAt: string;
}

export function useServiceHealth() {
  return useQuery({
    queryKey: ['services', 'status'],
    queryFn: async () => {
      const raw = await apiFetch<ServiceStatusRow[]>('/services/status');
      return raw.map(toServiceStatus);
    },
    refetchInterval: 30000,
  });
}

// ── Sanctions Screening (ScreeningPanel) ────────────────────────────────────

type SanctionsSourceRow = {
  id: string;
  name: string;
  enabled: boolean;
  last_check: string | null;
  entries_indexed: number;
  healthy: boolean;
};

type SanctionsMatchRow = {
  id: string;
  client_id: string;
  client_name: string;
  source: string;
  confidence: number;
  match_type: 'Exact' | 'Partial' | 'Fuzzy';
  status: 'Pending Review' | 'Confirmed Match' | 'False Positive' | 'Cleared';
  listed_entity: string;
  listed_entity_id: string;
  program: string;
  screened_at: string;
};

function toSanctionsSource(row: SanctionsSourceRow): SanctionsSource {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    lastCheck: row.last_check,
    entriesIndexed: row.entries_indexed,
    healthy: row.healthy,
  };
}

function toSanctionsMatch(row: SanctionsMatchRow): SanctionsMatch {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    source: row.source,
    confidence: row.confidence,
    matchType: row.match_type,
    status: row.status,
    listedEntity: row.listed_entity,
    listedEntityId: row.listed_entity_id,
    program: row.program,
    screenedAt: row.screened_at,
  };
}

export interface SanctionsSource {
  id: string;
  name: string;
  enabled: boolean;
  lastCheck: string | null;
  entriesIndexed: number;
  healthy: boolean;
}

export interface SanctionsMatch {
  id: string;
  clientId: string;
  clientName: string;
  source: string;
  confidence: number;
  matchType: 'Exact' | 'Partial' | 'Fuzzy';
  status: 'Pending Review' | 'Confirmed Match' | 'False Positive' | 'Cleared';
  listedEntity: string;
  listedEntityId: string;
  program: string;
  screenedAt: string;
}

export function useSanctionsSources() {
  return useQuery({
    queryKey: ['sanctions', 'sources'],
    queryFn: async () => {
      const raw = await apiFetch<SanctionsSourceRow[]>('/sanctions/sources');
      return raw.map(toSanctionsSource);
    },
  });
}

export function useSanctionsMatches(params?: { status?: string; clientId?: string; source?: string; page?: number; pageSize?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.clientId) searchParams.set('client_id', params.clientId);
  if (params?.source) searchParams.set('source', params.source);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('page_size', String(params.pageSize));

  return useQuery({
    queryKey: ['sanctions', 'matches', params],
    queryFn: async () => {
      const raw = await apiFetch<{
        matches: SanctionsMatchRow[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/sanctions/matches?${searchParams.toString()}`);
      return {
        matches: raw.matches.map(toSanctionsMatch),
        pagination: raw.pagination,
      };
    },
  });
}

export function useScreenName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { query: string; clientId?: string; clientName?: string }) => {
      const raw = await apiFetch<SanctionsMatchRow[]>('/sanctions/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return raw.map(toSanctionsMatch);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sanctions', 'matches'] }); },
  });
}

export function useUpdateSanctionsMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const raw = await apiFetch<SanctionsMatchRow>(`/sanctions/matches/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      return toSanctionsMatch(raw);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sanctions', 'matches'] }); },
  });
}

