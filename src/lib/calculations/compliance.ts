/**
 * Compliance calculation engine.
 *
 * Pure functions — no React, no storage — so they can run in the browser
 * today and inside a Supabase edge function / SQL view later.
 *
 * Rules implemented:
 *  - Only applicable tasks count: Not Applicable and Approved Exception are excluded.
 *  - Only tasks due in the selected period count (dueDate within range).
 *  - A task enters the denominator once its due date has passed, or earlier
 *    if it has already been completed (so work due later today/this week does
 *    not drag compliance down before it is late).
 *  - Unsubmitted tasks are NOT excluded — they count against compliance.
 *  - Rejected submissions do not count as completed.
 *  - Tasks that require approval only count once approved (status "completed"
 *    is only reached after approval; "submitted" does not count).
 *  - Employees with no applicable tasks get compliance = null ("N/A"), never 0%.
 *  - Division by zero returns null.
 */
import type {
  AnalyticsFilter,
  ComplianceTask,
  ComplianceThresholds,
  ComplianceTier,
  Database,
  DataScope,
  Employee,
  ISODate,
  Process,
  TaskStatus,
} from "@/types";

export const DEFAULT_THRESHOLDS: ComplianceThresholds = { excellent: 95, good: 85, needsImprovement: 70 };

export function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Stored status → status as of `today` (not-started/in-progress past due ⇒ overdue). */
export function getEffectiveStatus(task: Pick<ComplianceTask, "status" | "dueDate">, today: ISODate): TaskStatus {
  if ((task.status === "not_started" || task.status === "in_progress") && task.dueDate < today) return "overdue";
  return task.status;
}

export function isExcluded(status: TaskStatus): boolean {
  return status === "not_applicable" || status === "approved_exception";
}

export function isCompleted(task: Pick<ComplianceTask, "status" | "requiresApproval" | "reviewedAt">): boolean {
  if (task.status !== "completed") return false;
  // Defensive: a task requiring approval only counts once it has been reviewed.
  return !task.requiresApproval || task.reviewedAt !== null;
}

/** Does this task belong in the compliance denominator as of `today`? */
export function isDueForCompliance(task: ComplianceTask, today: ISODate): boolean {
  if (!task.required) return false;
  if (isExcluded(task.status)) return false;
  return task.dueDate < today || isCompleted(task);
}

export function isOnTime(task: ComplianceTask): boolean {
  return isCompleted(task) && task.submittedAt !== null && task.submittedAt.slice(0, 10) <= task.dueDate;
}

export interface ComplianceStats {
  /** All tasks in the set (any status). */
  totalAssigned: number;
  completed: number;
  /** Not started / in progress / submitted, and not yet overdue. */
  pending: number;
  /** Submitted and awaiting review. */
  awaitingReview: number;
  overdue: number;
  rejected: number;
  /** Completed tasks that went through approval. */
  approved: number;
  excluded: number;
  /** Denominator: required, applicable, due tasks. */
  due: number;
  /** Numerator: completed among `due`. */
  completedDue: number;
  onTime: number;
  compliance: number | null;
  onTimeRate: number | null;
  completionRate: number | null;
  avgQuality: number | null;
}

export function computeStats(tasks: readonly ComplianceTask[], today: ISODate): ComplianceStats {
  const s: ComplianceStats = {
    totalAssigned: tasks.length,
    completed: 0,
    pending: 0,
    awaitingReview: 0,
    overdue: 0,
    rejected: 0,
    approved: 0,
    excluded: 0,
    due: 0,
    completedDue: 0,
    onTime: 0,
    compliance: null,
    onTimeRate: null,
    completionRate: null,
    avgQuality: null,
  };
  let qualitySum = 0;
  let qualityN = 0;
  for (const t of tasks) {
    const st = getEffectiveStatus(t, today);
    const completed = isCompleted(t);
    if (completed) {
      s.completed++;
      if (t.requiresApproval) s.approved++;
      if (isOnTime(t)) s.onTime++;
      if (t.qualityScore !== null) {
        qualitySum += t.qualityScore;
        qualityN++;
      }
    } else if (st === "overdue") s.overdue++;
    else if (st === "rejected") s.rejected++;
    else if (isExcluded(st)) s.excluded++;
    else if (st === "submitted") {
      s.awaitingReview++;
      s.pending++;
    } else if (st !== "completed") s.pending++;

    if (isDueForCompliance(t, today)) {
      s.due++;
      if (completed) s.completedDue++;
    }
  }
  s.compliance = pct(s.completedDue, s.due);
  s.onTimeRate = pct(s.onTime, s.completed);
  s.completionRate = pct(s.completed, s.totalAssigned - s.excluded);
  s.avgQuality = qualityN ? Math.round((qualitySum / qualityN) * 10) / 10 : null;
  return s;
}

/**
 * Employee participation: employees who submitted at least one required task
 * ÷ employees expected to submit (≥ 1 required, applicable, due task).
 */
export function computeParticipation(tasks: readonly ComplianceTask[], today: ISODate) {
  const expected = new Set<string>();
  const participated = new Set<string>();
  for (const t of tasks) {
    if (!isDueForCompliance(t, today)) continue;
    expected.add(t.employeeId);
    if (t.submittedAt !== null || t.status === "submitted" || t.status === "completed" || t.status === "rejected") {
      participated.add(t.employeeId);
    }
  }
  return { expected: expected.size, participated: participated.size, rate: pct(participated.size, expected.size) };
}

export function getTier(value: number | null, thresholds: ComplianceThresholds = DEFAULT_THRESHOLDS): ComplianceTier {
  if (value === null) return "na";
  if (value >= thresholds.excellent) return "excellent";
  if (value >= thresholds.good) return "good";
  if (value >= thresholds.needsImprovement) return "needs_improvement";
  return "critical";
}

export const TIER_LABELS: Record<ComplianceTier, string> = {
  excellent: "Excellent",
  good: "Good",
  needs_improvement: "Needs Improvement",
  critical: "Critical",
  na: "No applicable tasks",
};

/** Group tasks by an arbitrary key and compute stats per group. */
export function groupStats<K extends string>(
  tasks: readonly ComplianceTask[],
  keyOf: (t: ComplianceTask) => K | null | undefined,
  today: ISODate,
): Map<K, ComplianceStats> {
  const buckets = new Map<K, ComplianceTask[]>();
  for (const t of tasks) {
    const k = keyOf(t);
    if (k === null || k === undefined) continue;
    const arr = buckets.get(k);
    if (arr) arr.push(t);
    else buckets.set(k, [t]);
  }
  const out = new Map<K, ComplianceStats>();
  for (const [k, arr] of buckets) out.set(k, computeStats(arr, today));
  return out;
}

/* ------------------------------------------------------------------ */
/* Filtering                                                           */
/* ------------------------------------------------------------------ */

export interface Indexes {
  employees: Map<string, Employee>;
  processes: Map<string, Process>;
}

// Cached by array identity — the store replaces arrays immutably on every write.
const employeeIndexCache = new WeakMap<readonly Employee[], Map<string, Employee>>();
const processIndexCache = new WeakMap<readonly Process[], Map<string, Process>>();

export function getIndexes(db: Pick<Database, "employees" | "processes">): Indexes {
  let employees = employeeIndexCache.get(db.employees);
  if (!employees) {
    employees = new Map(db.employees.map((e) => [e.id, e]));
    employeeIndexCache.set(db.employees, employees);
  }
  let processes = processIndexCache.get(db.processes);
  if (!processes) {
    processes = new Map(db.processes.map((p) => [p.id, p]));
    processIndexCache.set(db.processes, processes);
  }
  return { employees, processes };
}

export function employeeMatches(e: Employee, f: Partial<AnalyticsFilter>, scope?: DataScope | null): boolean {
  if (f.departmentId && e.departmentId !== f.departmentId) return false;
  if (f.teamId && e.teamId !== f.teamId) return false;
  if (f.employeeId && e.id !== f.employeeId) return false;
  if (f.bandId && e.bandId !== f.bandId) return false;
  if (scope) {
    if (scope.employeeIds && !scope.employeeIds.includes(e.id)) return false;
    if (scope.teamIds && (!e.teamId || !scope.teamIds.includes(e.teamId))) return false;
    if (scope.departmentIds && !scope.departmentIds.includes(e.departmentId)) return false;
  }
  return true;
}

export function processMatches(p: Process | undefined, f: Partial<AnalyticsFilter>): boolean {
  if (!p) return false;
  if (f.processId && p.id !== f.processId) return false;
  if (f.processCategoryId && p.categoryId !== f.processCategoryId) return false;
  if (f.processStatus && p.status !== f.processStatus) return false;
  return true;
}

/**
 * Filter tasks by analytics filter + role scope.
 * Pass `ignoreRange` to keep all dates (e.g. for trends).
 */
export function filterTasks(
  db: Pick<Database, "tasks" | "employees" | "processes">,
  filter: Partial<AnalyticsFilter>,
  scope?: DataScope | null,
  opts: { ignoreRange?: boolean } = {},
): ComplianceTask[] {
  const idx = getIndexes(db);
  const range = filter.range;
  return db.tasks.filter((t) => {
    if (!opts.ignoreRange && range && (t.dueDate < range.from || t.dueDate > range.to)) return false;
    const e = idx.employees.get(t.employeeId);
    if (!e || !employeeMatches(e, filter, scope)) return false;
    if (filter.processId || filter.processCategoryId || filter.processStatus) {
      if (!processMatches(idx.processes.get(t.processId), filter)) return false;
    }
    return true;
  });
}

export interface EmployeeCompliance {
  employee: Employee;
  stats: ComplianceStats;
  tier: ComplianceTier;
}

/** Per-employee compliance for a set of employees (employees with no tasks get N/A). */
export function computeEmployeeCompliance(
  employees: readonly Employee[],
  tasks: readonly ComplianceTask[],
  today: ISODate,
  thresholds: ComplianceThresholds,
): EmployeeCompliance[] {
  const byEmp = groupStats(tasks, (t) => t.employeeId, today);
  const empty = computeStats([], today);
  return employees.map((employee) => {
    const stats = byEmp.get(employee.id) ?? empty;
    return { employee, stats, tier: getTier(stats.compliance, thresholds) };
  });
}

export function tierCounts(rows: readonly EmployeeCompliance[]): Record<ComplianceTier, number> {
  const out: Record<ComplianceTier, number> = { excellent: 0, good: 0, needs_improvement: 0, critical: 0, na: 0 };
  for (const r of rows) out[r.tier]++;
  return out;
}
