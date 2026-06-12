'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useClients, useUBO } from '@/hooks/useApi';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { GitBranch, ZoomIn, ZoomOut, RotateCcw, Search, Filter, Users, Link2, ShieldCheck, ShieldAlert, Percent, ChevronRight, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

interface GraphNode {
  id: string;
  clientId: string;
  fullName: string;
  entityType: string;
  riskRating?: string;
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  relationshipType: string;
  ownershipPercentage: number | null;
  confidence: number;
  verified: boolean;
}

interface TooltipData {
  node: GraphNode & { x: number; y: number };
  edges: GraphEdge[];
  mouseX: number;
  mouseY: number;
}

const RISK_NODE_COLORS: Record<string, { fill: string; fillDark: string; stroke: string; strokeDark: string; glow: string; glowDark: string }> = {
  low: { fill: '#d1fae5', fillDark: '#064e3b', stroke: '#10b981', strokeDark: '#34d399', glow: '#10b981', glowDark: '#34d399' },
  medium: { fill: '#fef3c7', fillDark: '#78350f', stroke: '#f59e0b', strokeDark: '#fbbf24', glow: '#f59e0b', glowDark: '#fbbf24' },
  high: { fill: '#ffedd5', fillDark: '#7c2d12', stroke: '#f97316', strokeDark: '#fb923c', glow: '#f97316', glowDark: '#fb923c' },
  critical: { fill: '#fee2e2', fillDark: '#7f1d1d', stroke: '#ef4444', strokeDark: '#f87171', glow: '#ef4444', glowDark: '#f87171' },
};

export function UBOAnalysisSection() {
  const { data: clientsData } = useClients({ limit: 100 });
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const { data: uboData, isLoading: uboLoading } = useUBO(selectedEntityId || null);

  const clients = (clientsData?.clients ?? []) as Array<Record<string, unknown>>;
  const companiesAndTrusts = clients.filter((c: Record<string, unknown>) =>
    ['company', 'trust'].includes(c.entityType as string)
  );

  return (
    <div className="space-y-6">
      <SectionHeader title="UBO Analysis" description="Ultimate Beneficial Ownership graph visualization" icon={GitBranch} />

      {/* Entity Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Select Entity to Analyze</label>
              <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a company or trust..." />
                </SelectTrigger>
                <SelectContent>
                  {companiesAndTrusts.map((c: Record<string, unknown>) => (
                    <SelectItem key={c.id as string} value={c.id as string}>
                      {c.fullName as string} ({(c.entityType as string).charAt(0).toUpperCase() + (c.entityType as string).slice(1)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {uboLoading && selectedEntityId && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mr-3" />
          <span className="text-sm">Calculating UBO chains...</span>
        </div>
      )}

      {uboData && !uboLoading && (
        <UBOGraphWithDetails
          nodes={uboData.graph.nodes as GraphNode[]}
          edges={uboData.graph.edges as GraphEdge[]}
          centerId={uboData.entityId}
          maxDepth={uboData.maxDepthSearched}
          totalUBOs={uboData.totalUBOsFound}
          ultimateBeneficialOwners={uboData.ultimateBeneficialOwners as Array<Record<string, unknown>>}
        />
      )}

      {!selectedEntityId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select an entity above to view its ownership structure</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Wrapper that includes stats, search/filter, graph, and detail panel
function UBOGraphWithDetails({
  nodes,
  edges,
  centerId,
  maxDepth,
  totalUBOs,
  ultimateBeneficialOwners,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerId: string;
  maxDepth: number;
  totalUBOs: number;
  ultimateBeneficialOwners: Array<Record<string, unknown>>;
}) {
  // Compute stats
  const stats = useMemo(() => {
    const verifiedCount = edges.filter(e => e.verified).length;
    const unverifiedCount = edges.length - verifiedCount;
    const ownershipEdges = edges.filter(e => e.ownershipPercentage !== null);
    const avgOwnership = ownershipEdges.length > 0
      ? ownershipEdges.reduce((sum, e) => sum + (e.ownershipPercentage ?? 0), 0) / ownershipEdges.length
      : 0;
    return {
      totalEntities: nodes.length,
      totalRelationships: edges.length,
      verifiedCount,
      unverifiedCount,
      avgOwnership,
    };
  }, [nodes, edges]);

  const [searchQuery, setSearchQuery] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Filter edges based on verified filter
  const filteredEdges = useMemo(() => {
    if (verifiedFilter === 'all') return edges;
    return edges.filter(e => verifiedFilter === 'verified' ? e.verified : !e.verified);
  }, [edges, verifiedFilter]);

  // Compute which node IDs are connected to filtered edges
  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    filteredEdges.forEach(e => { ids.add(e.source); ids.add(e.target); });
    // Always include center node
    ids.add(centerId);
    return ids;
  }, [filteredEdges, centerId]);

  // Highlight matching nodes from search
  const matchingNodeIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      nodes
        .filter(n => n.fullName.toLowerCase().includes(q) || n.entityType.toLowerCase().includes(q))
        .map(n => n.id)
    );
  }, [nodes, searchQuery]);

  // Selected node detail
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(n => n.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  const selectedNodeEdges = useMemo(() => {
    if (!selectedNodeId) return [];
    return edges.filter(e => e.source === selectedNodeId || e.target === selectedNodeId);
  }, [edges, selectedNodeId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {/* Statistics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="py-0">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Entities</p>
                <p className="text-lg font-bold leading-tight">{stats.totalEntities}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Link2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Relationships</p>
                <p className="text-lg font-bold leading-tight">{stats.totalRelationships}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Verified</p>
                <p className="text-lg font-bold leading-tight text-emerald-700 dark:text-emerald-400">
                  {stats.verifiedCount}
                  <span className="text-xs font-normal text-muted-foreground"> / {stats.unverifiedCount}</span>
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
                <Percent className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Ownership</p>
                <p className="text-lg font-bold leading-tight text-amber-700 dark:text-amber-400">{stats.avgOwnership.toFixed(1)}%</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter Bar */}
        <Card className="py-0">
          <CardContent className="p-3">
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search entities by name or type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Filter className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
                <Select value={verifiedFilter} onValueChange={(v) => setVerifiedFilter(v as 'all' | 'verified' | 'unverified')}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Relationships</SelectItem>
                    <SelectItem value="verified">Verified Only</SelectItem>
                    <SelectItem value="unverified">Unverified Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {matchingNodeIds.size > 0 && (
                <Badge variant="outline" className="text-[10px] shrink-0 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                  {matchingNodeIds.size} match{matchingNodeIds.size > 1 ? 'es' : ''}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Graph Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Ownership Graph</CardTitle>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px]">Depth: {maxDepth}</Badge>
                <Badge variant="outline" className="text-[10px]">UBOs: {totalUBOs}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <UBOGraph
              nodes={nodes}
              edges={filteredEdges}
              centerId={centerId}
              connectedNodeIds={connectedNodeIds}
              matchingNodeIds={matchingNodeIds}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
          </CardContent>
        </Card>

        {/* Selected Node Detail Panel */}
        {selectedNode && (
          <Card className="border-primary/30 bg-primary/5 dark:bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold">{selectedNode.fullName}</h4>
                    <Badge variant="outline" className="text-[10px] capitalize">{selectedNode.entityType}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Risk Rating:</span>
                    <RiskBadge level={selectedNode.riskRating ?? 'low'} />
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedNodeId(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Connections ({selectedNodeEdges.length})</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {selectedNodeEdges.map((edge, idx) => {
                      const isSource = edge.source === selectedNodeId;
                      const otherNodeId = isSource ? edge.target : edge.source;
                      const otherNode = nodes.find(n => n.id === otherNodeId);
                      return (
                        <div key={idx} className="flex items-center gap-2 text-xs p-1.5 rounded bg-background/60">
                          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate">{otherNode?.fullName ?? otherNodeId}</span>
                          {edge.ownershipPercentage !== null && (
                            <Badge variant="outline" className="text-[9px] ml-auto shrink-0">{edge.ownershipPercentage}%</Badge>
                          )}
                          <Badge variant="outline" className={`text-[9px] shrink-0 ${edge.verified ? 'text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800' : 'text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-800'}`}>
                            {edge.verified ? '✓ Verified' : '⚠ Unverified'}
                          </Badge>
                        </div>
                      );
                    })}
                    {selectedNodeEdges.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No connections visible</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Details</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between p-1.5 rounded bg-background/60">
                      <span className="text-muted-foreground">Entity Type</span>
                      <span className="font-medium capitalize">{selectedNode.entityType}</span>
                    </div>
                    <div className="flex justify-between p-1.5 rounded bg-background/60">
                      <span className="text-muted-foreground">Risk Rating</span>
                      <span className="font-medium capitalize">{selectedNode.riskRating ?? 'N/A'}</span>
                    </div>
                    <div className="flex justify-between p-1.5 rounded bg-background/60">
                      <span className="text-muted-foreground">Total Connections</span>
                      <span className="font-medium">{selectedNodeEdges.length}</span>
                    </div>
                    <div className="flex justify-between p-1.5 rounded bg-background/60">
                      <span className="text-muted-foreground">Avg Ownership</span>
                      <span className="font-medium">
                        {selectedNodeEdges.filter(e => e.ownershipPercentage !== null).length > 0
                          ? (selectedNodeEdges.filter(e => e.ownershipPercentage !== null).reduce((s, e) => s + (e.ownershipPercentage ?? 0), 0) / selectedNodeEdges.filter(e => e.ownershipPercentage !== null).length).toFixed(1) + '%'
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between p-1.5 rounded bg-background/60">
                      <span className="text-muted-foreground">Is Center Node</span>
                      <span className="font-medium">{selectedNode.id === centerId ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* UBO Results Panel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Beneficial Owners</CardTitle>
        </CardHeader>
        <CardContent>
          {ultimateBeneficialOwners.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No UBOs found</p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {ultimateBeneficialOwners.map((ubo: Record<string, unknown>, idx: number) => {
                const ownership = ubo.totalOwnership as number;
                const isAboveThreshold = ownership >= 25;
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/30 ${
                      isAboveThreshold ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20' : 'border-border'
                    }`}
                    onClick={() => setSelectedNodeId(ubo.entityId as string)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{ubo.entityName as string}</span>
                      <RiskBadge level={ownership >= 50 ? 'high' : ownership >= 25 ? 'medium' : 'low'} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Ownership: <span className={isAboveThreshold ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>{ownership.toFixed(1)}%</span></span>
                      <span>Confidence: {(ubo.confidence as number * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 capitalize">
                      {(ubo.entityType as string)} {isAboveThreshold && '⚠ Above 25% threshold'}
                    </div>
                    {(ubo.paths as Array<Record<string, unknown>>)?.length > 0 && (
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        Paths: {(ubo.paths as Array<Record<string, unknown>>).map((p: Record<string, unknown>) =>
                          (p.relationshipTypes as string[])?.join(' → ')
                        ).join(' | ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// SVG-based Graph Visualization with interactive features
function UBOGraph({
  nodes,
  edges,
  centerId,
  connectedNodeIds,
  matchingNodeIds,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerId: string;
  connectedNodeIds: Set<string>;
  matchingNodeIds: Set<string>;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [svgRect, setSvgRect] = useState<DOMRect | null>(null);

  // Update SVG rect on mount/resize
  useEffect(() => {
    const updateRect = () => {
      if (containerRef.current) {
        setSvgRect(containerRef.current.getBoundingClientRect());
      }
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, []);

  // Layout algorithm: simple radial layout
  const layoutNodes = useMemo(() => {
    if (nodes.length === 0) return [];

    const width = 700;
    const height = 440;
    const centerX = width / 2;
    const centerY = height / 2;

    // Separate center from non-center
    const centerNode = nodes.find(n => n.id === centerId);
    const otherNodes = nodes.filter(n => n.id !== centerId);

    const layouted: Array<GraphNode & { x: number; y: number }> = [];

    // Place center node
    if (centerNode) {
      layouted.push({ ...centerNode, x: centerX, y: centerY });
    }

    // Place other nodes in concentric rings based on distance from center
    // Group by distance (hops from center)
    const adjacency = new Map<string, string[]>();
    nodes.forEach(n => adjacency.set(n.id, []));
    edges.forEach(e => {
      adjacency.get(e.source)?.push(e.target);
      adjacency.get(e.target)?.push(e.source);
    });

    // BFS from center
    const visited = new Set<string>();
    const rings: string[][] = [];
    const queue: Array<{ id: string; dist: number }> = centerNode ? [{ id: centerNode.id, dist: 0 }] : [];

    while (queue.length > 0) {
      const { id, dist } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (dist > 0) {
        while (rings.length < dist) rings.push([]);
        rings[dist - 1].push(id);
      }
      for (const neighbor of (adjacency.get(id) ?? [])) {
        if (!visited.has(neighbor)) {
          queue.push({ id: neighbor, dist: dist + 1 });
        }
      }
    }

    // Add any unvisited nodes
    otherNodes.forEach(n => {
      if (!visited.has(n.id)) {
        while (rings.length < 1) rings.push([]);
        rings[0].push(n.id);
      }
    });

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    rings.forEach((ring, ringIdx) => {
      const radius = 120 + ringIdx * 100;
      ring.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / ring.length - Math.PI / 2;
        layouted.push({
          ...(nodeMap.get(id) ?? { id, clientId: '', fullName: id, entityType: 'unknown' }),
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        });
      });
    });

    return layouted;
  }, [nodes, edges, centerId]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode & { x: number; y: number }>();
    layoutNodes.forEach(n => map.set(n.id, n));
    return map;
  }, [layoutNodes]);

  // Get edges connected to a node
  const getNodeEdges = useCallback((nodeId: string) => {
    return edges.filter(e => e.source === nodeId || e.target === nodeId);
  }, [edges]);

  // Get connected node IDs for a given node
  const getConnectedIds = useCallback((nodeId: string) => {
    const ids = new Set<string>();
    edges.forEach(e => {
      if (e.source === nodeId) ids.add(e.target);
      if (e.target === nodeId) ids.add(e.source);
    });
    return ids;
  }, [edges]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.3, Math.min(3, z + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const getNodeColors = (riskRating: string | undefined, isCenter: boolean) => {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    if (isCenter) {
      return {
        fill: isDark ? '#1e293b' : '#334155',
        stroke: isDark ? '#fbbf24' : '#f59e0b',
        glow: isDark ? '#fbbf2450' : '#f59e0b40',
      };
    }
    const risk = riskRating ?? 'low';
    const riskColors = RISK_NODE_COLORS[risk] ?? RISK_NODE_COLORS.low;
    return {
      fill: isDark ? riskColors.fillDark : riskColors.fill,
      stroke: isDark ? riskColors.strokeDark : riskColors.stroke,
      glow: isDark ? riskColors.glowDark + '40' : riskColors.glow + '35',
    };
  };

  const getNodeShape = (
    entityType: string,
    x: number,
    y: number,
    isCenter: boolean,
    riskRating?: string,
    isSelected?: boolean,
    isDimmed?: boolean,
    isSearchMatch?: boolean,
  ) => {
    const size = isCenter ? 32 : 24;
    const colors = getNodeColors(riskRating, isCenter);
    const opacity = isDimmed ? 0.25 : 1;
    const strokeW = isSelected ? 3.5 : 2;

    const commonProps = {
      fill: colors.fill,
      stroke: isSelected ? '#3b82f6' : colors.stroke,
      strokeWidth: strokeW,
      opacity,
      style: { transition: 'opacity 0.2s, stroke 0.2s, stroke-width 0.2s' } as React.CSSProperties,
    };

    // Shadow/glow filter reference
    const filterRef = isCenter ? 'url(#glowCenter)' : isSelected ? 'url(#glowSelect)' : isSearchMatch ? 'url(#glowSearch)' : 'url(#shadowNode)';

    switch (entityType) {
      case 'individual':
        return <circle cx={x} cy={y} r={size} filter={filterRef} {...commonProps} />;
      case 'company':
        return <rect x={x - size} y={y - size * 0.7} width={size * 2} height={size * 1.4} rx={4} filter={filterRef} {...commonProps} />;
      case 'trust':
        return <polygon points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`} filter={filterRef} {...commonProps} />;
      default:
        return <circle cx={x} cy={y} r={size} filter={filterRef} {...commonProps} />;
    }
  };

  const getEdgeLabel = (edge: GraphEdge) => {
    const type = edge.relationshipType.replace(/_/g, ' ');
    const pct = edge.ownershipPercentage ? `${edge.ownershipPercentage}%` : '';
    return `${type}${pct ? ` ${pct}` : ''}`;
  };

  // Determine which edges are highlighted based on selection
  const highlightedEdgeKeys = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const ids = new Set<string>();
    edges.forEach((e, i) => {
      if (e.source === selectedNodeId || e.target === selectedNodeId) {
        ids.add(String(i));
      }
    });
    return ids;
  }, [edges, selectedNodeId]);

  // Determine which nodes are connected to selected node
  const highlightedNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const ids = new Set<string>();
    ids.add(selectedNodeId);
    edges.forEach(e => {
      if (e.source === selectedNodeId) ids.add(e.target);
      if (e.target === selectedNodeId) ids.add(e.source);
    });
    return ids;
  }, [edges, selectedNodeId]);

  // Tooltip handlers
  const handleNodeMouseEnter = useCallback((node: GraphNode & { x: number; y: number }, e: React.MouseEvent) => {
    const nodeEdges = getNodeEdges(node.id);
    setTooltip({ node, edges: nodeEdges, mouseX: e.clientX, mouseY: e.clientY });
  }, [getNodeEdges]);

  const handleNodeMouseMove = useCallback((e: React.MouseEvent) => {
    if (tooltip) {
      setTooltip(prev => prev ? { ...prev, mouseX: e.clientX, mouseY: e.clientY } : null);
    }
  }, [tooltip]);

  const handleNodeMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    onSelectNode(selectedNodeId === nodeId ? null : nodeId);
  }, [selectedNodeId, onSelectNode]);

  return (
    <div className="relative" ref={containerRef}>
      {/* Zoom Controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(3, z + 0.2))}>
          <ZoomIn className="h-3 w-3" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.3, z - 0.2))}>
          <ZoomOut className="h-3 w-3" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-10 flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-emerald-400 inline-block" /> Low</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-400 inline-block" /> Medium</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-orange-400 inline-block" /> High</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-red-400 inline-block" /> Critical</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0 border-t-2 border-dashed border-amber-400" /> Unverified
        </span>
      </div>

      {/* SVG Graph */}
      <svg
        ref={svgRef}
        width="100%"
        height="440"
        viewBox="0 0 700 440"
        className="border rounded-lg bg-white dark:bg-slate-900"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setTooltip(null); }}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {/* Defs: grid, arrow, filters */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-slate-200 dark:text-slate-700" />
          </pattern>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
          </marker>
          <marker id="arrowheadHighlight" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
          </marker>
          {/* Shadow filter for nodes */}
          <filter id="shadowNode" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.12" />
          </filter>
          {/* Glow for center node */}
          <filter id="glowCenter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor="#f59e0b" floodOpacity="0.3" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Glow for selected node */}
          <filter id="glowSelect" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feFlood floodColor="#3b82f6" floodOpacity="0.4" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Glow for search match */}
          <filter id="glowSearch" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor="#f59e0b" floodOpacity="0.35" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {edges.map((edge, idx) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target || source.x === undefined || target.x === undefined) return null;

            const isHighlighted = highlightedEdgeKeys.has(String(idx));
            const isDimmed = selectedNodeId ? !isHighlighted : false;
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2 - 10;
            const labelText = getEdgeLabel(edge);

            const edgeColor = isHighlighted
              ? '#3b82f6'
              : edge.verified ? '#64748b' : '#f59e0b';
            const edgeOpacity = isDimmed ? 0.15 : 1;
            const edgeWidth = isHighlighted ? 2.5 : edge.verified ? 1.5 : 1;

            return (
              <g key={idx} style={{ opacity: edgeOpacity, transition: 'opacity 0.2s' }}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={edgeColor}
                  strokeWidth={edgeWidth}
                  strokeDasharray={edge.verified ? 'none' : '6,4'}
                  markerEnd={isHighlighted ? 'url(#arrowheadHighlight)' : 'url(#arrowhead)'}
                />
                {/* Edge label pill background */}
                {labelText && (
                  <g>
                    <rect
                      x={midX - labelText.length * 2.5 - 4}
                      y={midY - 7}
                      width={labelText.length * 5 + 8}
                      height={14}
                      rx={4}
                      fill={isHighlighted ? '#3b82f6' : edge.verified ? 'white' : '#fef3c7'}
                      stroke={isHighlighted ? '#3b82f6' : edge.verified ? '#e2e8f0' : '#f59e0b'}
                      strokeWidth={0.5}
                      className="dark:fill-slate-800 dark:stroke-slate-600"
                    />
                    <text
                      x={midX}
                      y={midY + 3}
                      textAnchor="middle"
                      fontSize="7"
                      fontWeight="500"
                      fill={isHighlighted ? 'white' : edge.verified ? '#475569' : '#b45309'}
                      className="dark:fill-slate-300"
                    >
                      {labelText}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {layoutNodes.map((node) => {
            const isCenter = node.id === centerId;
            const isSelected = node.id === selectedNodeId;
            const isConnectedToSelected = highlightedNodeIds.has(node.id);
            const isDimmed = selectedNodeId ? !isConnectedToSelected : false;
            const isSearchMatch = matchingNodeIds.has(node.id);
            const isInGraph = connectedNodeIds.has(node.id);

            const textFill = typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? '#e2e8f0' : '#1e293b';
            const subTextFill = typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b';

            // If the node is not in the filtered graph (due to verified filter), dim it
            const effectiveDimmed = isDimmed || !isInGraph;

            return (
              <g
                key={node.id}
                style={{
                  cursor: 'pointer',
                  opacity: effectiveDimmed ? 0.2 : 1,
                  transition: 'opacity 0.2s',
                }}
                onClick={() => handleNodeClick(node.id)}
                onMouseEnter={(e) => handleNodeMouseEnter(node, e)}
                onMouseMove={handleNodeMouseMove}
                onMouseLeave={handleNodeMouseLeave}
              >
                {/* Pulsing ring for center node */}
                {isCenter && (
                  <>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={38}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1"
                      opacity="0.4"
                    >
                      <animate attributeName="r" values="36;44;36" dur="2.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2.5s" repeatCount="indefinite" />
                    </circle>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={42}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="0.5"
                      opacity="0.2"
                    >
                      <animate attributeName="r" values="42;52;42" dur="2.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.2;0.05;0.2" dur="2.5s" repeatCount="indefinite" />
                    </circle>
                  </>
                )}

                {/* Search match highlight ring */}
                {isSearchMatch && !isSelected && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isCenter ? 38 : 30}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeDasharray="4,2"
                    opacity="0.8"
                  >
                    <animate attributeName="stroke-dashoffset" values="0;12" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Selected highlight ring */}
                {isSelected && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isCenter ? 40 : 32}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    opacity="0.6"
                  >
                    <animate attributeName="r" values={isCenter ? '38;42;38' : '30;34;30'} dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0.3;0.6" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Node shape */}
                {getNodeShape(node.entityType, node.x!, node.y!, isCenter, node.riskRating, isSelected, effectiveDimmed, isSearchMatch)}

                {/* Node label */}
                <text x={node.x} y={(node.y ?? 0) + (isCenter ? 46 : 36)} textAnchor="middle" fontSize="9" fill={textFill} fontWeight={isCenter ? 'bold' : 'normal'} style={{ pointerEvents: 'none' }}>
                  {node.fullName.length > 22 ? node.fullName.slice(0, 19) + '...' : node.fullName}
                </text>
                <text x={node.x} y={(node.y ?? 0) + (isCenter ? 56 : 46)} textAnchor="middle" fontSize="7" fill={subTextFill} style={{ pointerEvents: 'none' }}>
                  {node.entityType}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* HTML Tooltip overlay */}
      {tooltip && svgRect && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: tooltip.mouseX - svgRect.left + 12,
            top: tooltip.mouseY - svgRect.top - 10,
          }}
        >
          <div className="bg-popover border rounded-lg shadow-lg p-3 min-w-[200px] max-w-[280px]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold truncate">{tooltip.node.fullName}</span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="outline" className="text-[10px] capitalize">{tooltip.node.entityType}</Badge>
              <RiskBadge level={tooltip.node.riskRating ?? 'low'} />
              {tooltip.node.id === centerId && (
                <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">Center</Badge>
              )}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Connections</span>
                <span className="font-medium text-foreground">{tooltip.edges.length}</span>
              </div>
              {tooltip.edges.some(e => e.ownershipPercentage !== null) && (
                <div className="flex justify-between">
                  <span>Ownership Range</span>
                  <span className="font-medium text-foreground">
                    {Math.min(...tooltip.edges.filter(e => e.ownershipPercentage !== null).map(e => e.ownershipPercentage!)).toFixed(0)}% – {Math.max(...tooltip.edges.filter(e => e.ownershipPercentage !== null).map(e => e.ownershipPercentage!)).toFixed(0)}%
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Verified</span>
                <span className="font-medium text-foreground">
                  {tooltip.edges.filter(e => e.verified).length} / {tooltip.edges.length}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 border-t pt-1.5">Click to select & view details</p>
          </div>
        </div>
      )}
    </div>
  );
}
