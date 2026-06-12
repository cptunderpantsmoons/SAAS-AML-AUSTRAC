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
