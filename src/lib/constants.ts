import type { AssignmentLevel, ComplianceTier, EmploymentStatus, Frequency, NotificationType, Priority, ProcessStatus, TaskStatus } from "@/types";

/** Semantic tone used by badges/indicators. Colors are defined as CSS tokens. */
export type Tone = "success" | "warning" | "danger" | "info" | "teal" | "neutral";

export const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/25",
  danger: "bg-danger-soft text-danger border-danger/20",
  info: "bg-info-soft text-info border-info/20",
  teal: "bg-teal-soft text-teal border-teal/20",
  neutral: "bg-muted text-muted-foreground border-border",
};

export const TONE_VAR: Record<Tone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  teal: "var(--teal)",
  neutral: "var(--muted-foreground)",
};

export const TASK_STATUS_META: Record<TaskStatus, { label: string; tone: Tone }> = {
  not_started: { label: "Not Started", tone: "neutral" },
  in_progress: { label: "In Progress", tone: "info" },
  submitted: { label: "Submitted", tone: "teal" },
  completed: { label: "Completed", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  overdue: { label: "Overdue", tone: "danger" },
  not_applicable: { label: "Not Applicable", tone: "neutral" },
  approved_exception: { label: "Approved Exception", tone: "warning" },
};

export const TASK_STATUSES = Object.keys(TASK_STATUS_META) as TaskStatus[];

export const TIER_META: Record<ComplianceTier, { label: string; tone: Tone; color: string }> = {
  excellent: { label: "Excellent", tone: "success", color: "var(--success)" },
  good: { label: "Good", tone: "teal", color: "var(--teal)" },
  needs_improvement: { label: "Needs Improvement", tone: "warning", color: "var(--warning)" },
  critical: { label: "Critical", tone: "danger", color: "var(--danger)" },
  na: { label: "N/A", tone: "neutral", color: "var(--muted-foreground)" },
};

export const PROCESS_STATUS_META: Record<ProcessStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Active", tone: "success" },
  under_review: { label: "Under Review", tone: "warning" },
  inactive: { label: "Inactive", tone: "neutral" },
};

export const EMPLOYMENT_STATUS_META: Record<EmploymentStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "success" },
  on_leave: { label: "On Leave", tone: "warning" },
  inactive: { label: "Inactive", tone: "neutral" },
};

export const PRIORITY_META: Record<Priority, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Medium", tone: "info" },
  high: { label: "High", tone: "warning" },
  critical: { label: "Critical", tone: "danger" },
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
  event_based: "Event Based",
  custom: "Custom",
};

export const ASSIGNMENT_LEVEL_LABELS: Record<AssignmentLevel, string> = {
  organization: "Organization",
  department: "Department",
  team: "Team",
  band: "Band",
  employee: "Individual Employee",
};

export const NOTIFICATION_TYPE_META: Record<NotificationType, { label: string; tone: Tone }> = {
  process_assigned: { label: "Process Assigned", tone: "info" },
  due_soon: { label: "Due Soon", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
  submission_completed: { label: "Submission Completed", tone: "success" },
  submission_rejected: { label: "Submission Rejected", tone: "danger" },
  approval_pending: { label: "Approval Pending", tone: "teal" },
  below_threshold: { label: "Below Threshold", tone: "warning" },
};

/** Categorical chart slots — fixed order, never cycled (validated palette). */
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)"];
