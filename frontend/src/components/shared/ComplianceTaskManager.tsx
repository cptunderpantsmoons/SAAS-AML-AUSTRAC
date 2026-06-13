'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, CheckCircle2, Circle, AlertCircle, Clock, X, CalendarDays, ListChecks, Loader2 } from 'lucide-react';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask, type ComplianceTask } from '@/hooks/useApi';
import { toast } from 'sonner';

// Types
type Priority = 'critical' | 'high' | 'medium' | 'low';
type Category = 'KYC Review' | 'Sanctions' | 'Report Filing' | 'Audit' | 'Training';

// Constants
const ASSIGNEES: string[] = [];

const CATEGORIES: Category[] = ['KYC Review', 'Sanctions', 'Report Filing', 'Audit', 'Training'];

const PRIORITY_CONFIG: Record<Priority, {
  color: string;
  border: string;
  bg: string;
  text: string;
  dot: string;
  badgeBg: string;
  badgeText: string;
  label: string;
}> = {
  critical: {
    color: 'red',
    border: 'border-l-red-500',
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
    dot: 'bg-red-500',
    badgeBg: 'bg-red-600 dark:bg-red-700',
    badgeText: 'text-white',
    label: 'CRITICAL',
  },
  high: {
    color: 'orange',
    border: 'border-l-orange-500',
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-400',
    dot: 'bg-orange-500',
    badgeBg: 'bg-orange-500 dark:bg-orange-600',
    badgeText: 'text-white',
    label: 'HIGH',
  },
  medium: {
    color: 'amber',
    border: 'border-l-amber-500',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
    badgeBg: 'bg-amber-500 dark:bg-amber-600',
    badgeText: 'text-white',
    label: 'MEDIUM',
  },
  low: {
    color: 'slate',
    border: 'border-l-slate-400',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
    dot: 'bg-slate-400 dark:bg-slate-500',
    badgeBg: 'bg-slate-500 dark:bg-slate-600',
    badgeText: 'text-white',
    label: 'LOW',
  },
};

const CATEGORY_COLORS: Record<Category, string> = {
  'KYC Review': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  'Sanctions': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'Report Filing': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  'Audit': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Training': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

// Helper to get initials
function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase();
}

// Calculate days overdue
function getDaysOverdue(dueDate: string | Date): number {
  const now = new Date();
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  const diffMs = now.getTime() - due.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Time ago formatter
function timeAgo(date: string | Date): string {
  const now = new Date();
  const due = typeof date === 'string' ? new Date(date) : date;
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    if (absDays === 0) return 'Today';
    if (absDays === 1) return '1 day overdue';
    return `${absDays} days overdue`;
  }
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays <= 7) return `Due in ${diffDays} days`;
  return due.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

// Status filter type
type StatusFilter = 'all' | 'active' | 'completed' | 'overdue';
type PriorityFilter = 'all' | Priority;

export function ComplianceTaskManager() {
  const tasksQuery = useTasks({ pageSize: 200 });
  const tasks = (tasksQuery.data?.tasks ?? []) as ComplianceTask[];
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as Priority,
    dueDate: '',
    category: 'KYC Review' as Category,
    assignee: '',
  });

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Auto-detect overdue
      const isOverdue = task.status !== 'completed' && new Date(task.dueDate) < new Date();
      const effectiveStatus = task.status === 'completed' ? 'completed' : (isOverdue ? 'overdue' : 'active');

      if (statusFilter !== 'all' && effectiveStatus !== statusFilter) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter]);

  // Task counts
  const taskCounts = useMemo(() => {
    const now = new Date();
    const active = tasks.filter(t => t.status !== 'completed' && new Date(t.dueDate) >= now).length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const overdue = tasks.filter(t => t.status !== 'completed' && new Date(t.dueDate) < now).length;
    return { total: tasks.length, active, completed, overdue };
  }, [tasks]);

  // Toggle task completion
  const toggleTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const nextStatus: 'active' | 'completed' = task.status === 'completed' ? 'active' : 'completed';
    updateTask.mutate(
      { id, data: { status: nextStatus } },
      {
        onError: (err) => {
          toast.error(`Failed to update task: ${err instanceof Error ? err.message : 'unknown error'}`);
        },
      },
    );
  };

  // Add new task
  const handleAddTask = () => {
    if (!newTask.title.trim() || !newTask.dueDate) {
      toast.error('Title and due date are required');
      return;
    }
    createTask.mutate(
      {
        title: newTask.title.trim(),
        description: newTask.description.trim(),
        priority: newTask.priority,
        due_date: new Date(newTask.dueDate).toISOString(),
        category: newTask.category,
        assignee: newTask.assignee || 'Unassigned',
      },
      {
        onSuccess: () => {
          setNewTask({
            title: '',
            description: '',
            priority: 'medium',
            dueDate: '',
            category: 'KYC Review',
            assignee: '',
          });
          setShowAddForm(false);
          toast.success('Task created');
        },
        onError: (err) => {
          toast.error(`Failed to create task: ${err instanceof Error ? err.message : 'unknown error'}`);
        },
      },
    );
  };

  const handleDeleteTask = (id: string) => {
    deleteTask.mutate(id, {
      onError: (err) => {
        toast.error(`Failed to delete task: ${err instanceof Error ? err.message : 'unknown error'}`);
      },
    });
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-800 dark:via-slate-800/80 dark:to-slate-900 shadow-sm">
              <ListChecks className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </div>
            <CardTitle className="text-base font-semibold">Compliance Tasks</CardTitle>
            <Badge variant="secondary" className="text-xs font-medium">
              {taskCounts.total}
            </Badge>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="h-8 gap-1"
          >
            {showAddForm ? (
              <>
                <X className="h-3.5 w-3.5" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Add Task
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Status Filter Tabs */}
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
            {([
              { key: 'all', label: 'All', count: taskCounts.total },
              { key: 'active', label: 'Active', count: taskCounts.active },
              { key: 'completed', label: 'Completed', count: taskCounts.completed },
              { key: 'overdue', label: 'Overdue', count: taskCounts.overdue },
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  statusFilter === key
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`ml-1.5 text-[10px] ${statusFilter === key ? 'text-foreground/60' : 'text-muted-foreground/60'}`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Priority Filter */}
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Add Task Inline Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  New Compliance Task
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Input
                      placeholder="Task title"
                      value={newTask.title}
                      onChange={(e) => setNewTask(p => ({ ...p, title: e.target.value }))}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Textarea
                      placeholder="Description (optional)"
                      value={newTask.description}
                      onChange={(e) => setNewTask(p => ({ ...p, description: e.target.value }))}
                      rows={2}
                      className="text-sm resize-none"
                    />
                  </div>
                  <Select value={newTask.priority} onValueChange={(v) => setNewTask(p => ({ ...p, priority: v as Priority }))}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask(p => ({ ...p, dueDate: e.target.value }))}
                    className="h-9 text-xs"
                  />
                  <Select value={newTask.category} onValueChange={(v) => setNewTask(p => ({ ...p, category: v as Category }))}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={newTask.assignee} onValueChange={(v) => setNewTask(p => ({ ...p, assignee: v }))}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNEES.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddForm(false)}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddTask}
                    disabled={!newTask.title.trim() || !newTask.dueDate}
                    className="h-8 text-xs"
                  >
                    Save Task
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Task List */}
        <ScrollArea className="max-h-96">
          <div className="space-y-2 pr-3">
            <AnimatePresence mode="popLayout">
              {filteredTasks.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-8 text-muted-foreground"
                >
                  <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No tasks match the current filters</p>
                </motion.div>
              ) : (
                filteredTasks.map((task) => {
                  const isOverdue = task.status !== 'completed' && new Date(task.dueDate) < new Date();
                  const isCompleted = task.status === 'completed';
                  const priorityConf = PRIORITY_CONFIG[task.priority];
                  const daysOverdue = isOverdue ? getDaysOverdue(task.dueDate) : 0;

                  return (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.25 }}
                      className={`relative rounded-lg border border-l-4 ${priorityConf.border} bg-card hover:bg-muted/20 transition-colors ${
                        isOverdue ? 'bg-red-50/30 dark:bg-red-950/20' : ''
                      } ${isCompleted ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start gap-3 p-3">
                        {/* Checkbox */}
                        <div className="pt-0.5">
                          <Checkbox
                            checked={isCompleted}
                            onCheckedChange={() => toggleTask(task.id)}
                            className="mt-0.5"
                          />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h5 className={`text-sm font-semibold leading-tight ${
                                isCompleted ? 'line-through text-muted-foreground' : ''
                              }`}>
                                {task.title}
                              </h5>
                              {/* Due date line below title for overdue tasks */}
                              {isOverdue && (
                                <p className="text-[10px] text-red-500/80 mt-0.5 flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3" />
                                  Due: {new Date(task.dueDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                              )}
                            </div>
                            {isOverdue && (
                              <motion.div
                                animate={{ opacity: [1, 0.4, 1] }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                className="flex items-center gap-1.5 shrink-0"
                              >
                                {/* Pulsing red dot */}
                                <span className="relative flex h-2.5 w-2.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                </span>
                                {/* Overdue badge */}
                                <Badge className="bg-red-600 text-white text-[10px] h-5 border-0 font-semibold shrink-0">
                                  {daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`}
                                </Badge>
                              </motion.div>
                            )}
                          </div>

                          {task.description && (
                            <p className={`text-xs leading-relaxed ${
                              isCompleted ? 'line-through text-muted-foreground/60' : 'text-muted-foreground'
                            }`}>
                              {task.description.length > 100
                                ? task.description.slice(0, 100) + '...'
                                : task.description
                              }
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {/* Priority Badge with colored dot */}
                            <Badge variant="outline" className={`text-[10px] h-5 ${priorityConf.badgeBg} ${priorityConf.badgeText} border-0 font-semibold gap-1`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${priorityConf.dot}`} />
                              {priorityConf.label}
                            </Badge>

                            {/* Category Badge */}
                            <Badge variant="outline" className={`text-[10px] h-5 ${CATEGORY_COLORS[task.category]} border-0 font-medium`}>
                              {task.category}
                            </Badge>

                            {/* Due Date */}
                            {!isOverdue && (
                              <span className="text-[10px] flex items-center gap-1 text-muted-foreground">
                                <CalendarDays className="h-3 w-3" />
                                {timeAgo(task.dueDate)}
                              </span>
                            )}

                            {/* Assignee */}
                            <span className="text-[10px] flex items-center gap-1 text-muted-foreground ml-auto">
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                {getInitials(task.assignee)}
                              </span>
                              {task.assignee ? task.assignee.split(' ')[0] : 'Unassigned'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Footer Stats */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t">
          <span className="flex items-center gap-1.5">
            <Circle className="h-2.5 w-2.5 text-emerald-500 fill-emerald-500" />
            {taskCounts.active} active
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-2.5 w-2.5 text-slate-400 fill-slate-400" />
            {taskCounts.completed} completed
          </span>
          <span className="flex items-center gap-1.5">
            <AlertCircle className="h-2.5 w-2.5 text-red-500 fill-red-500" />
            {taskCounts.overdue} overdue
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
