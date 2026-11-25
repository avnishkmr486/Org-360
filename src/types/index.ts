/**
 * Organization 360 — domain model.
 *
 * Every interface here maps 1:1 to a future Supabase/PostgreSQL table.
 * IDs are strings, dates are ISO-8601 strings (date-only "yyyy-MM-dd" for
 * calendar dates, full timestamps for events), and relations are stored as
 * foreign-key IDs so the mock repository can later be swapped for SQL.
 */

export type ID = string;
/** Calendar date, "yyyy-MM-dd". */
export type ISODate = string;
/** Full timestamp, ISO-8601. */
export type ISODateTime = string;

export type RecordStatus = "active" | "inactive";

/* ------------------------------------------------------------------ */
/* Organization                                                        */
/* ------------------------------------------------------------------ */

export interface Organization {
  id: ID;
  name: string;
  shortName: string;
  appName: string;
  tagline: string;
  industry: string;
  description: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  /** Path or data URL of the organization logo. Replaceable from Settings. */
  logoUrl: string;
  foundedYear: number;
}

export interface Department {
  id: ID;
  code: string;
  name: string;
  description: string;
  headId: ID | null;
  status: RecordStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Team {
  id: ID;
  name: string;
  description: string;
  departmentId: ID;
  supervisorId: ID | null;
  projectManagerId: ID | null;
  status: RecordStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Master data                                                         */
/* ------------------------------------------------------------------ */

export interface Band {
  id: ID;
  code: string;
  name: string;
  level: number;
  description: string;
  status: RecordStatus;
}

export interface Designation {
  id: ID;
  name: string;
  description: string;
  status: RecordStatus;
  /** What the role is for, in a sentence or two. */
  summary?: string;
  /** Key responsibilities, one per line. */
  responsibilities?: string;
}

export interface ProcessCategory {
  id: ID;
  name: string;
  description: string;
  status: RecordStatus;
}

export type Frequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annually"
  | "event_based"
  | "custom";

export interface FrequencyDefinition {
  id: Frequency;
  name: string;
  description: string;
  status: RecordStatus;
}

/* ------------------------------------------------------------------ */
/* Employees                                                           */
/* ------------------------------------------------------------------ */

export type EmploymentStatus = "active" | "on_leave" | "inactive";

export interface Employee {
  /** Free-form string business key, e.g. "2011-256" or "EMP-1001". Unique (case-insensitive) — used by Excel import. */
  id: ID;
  firstName: string;
  lastName: string;
  /** Optional — "" means not provided. Unique only when non-empty. */
  email: string;
  phone: string;
  bandId: ID;
  /** Job title from Master Data → Designations. Optional: older saved data has none. */
  designationId?: ID | null;
  /** Responsibilities specific to this person, one per line (on top of the designation's). */
  responsibilities?: string;
  departmentId: ID;
  /** Department heads and leadership may not belong to a team. */
  teamId: ID | null;
  reportingManagerId: ID | null;
  dateOfJoining: ISODate;
  status: EmploymentStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Processes                                                           */
/* ------------------------------------------------------------------ */

export type Priority = "low" | "medium" | "high" | "critical";
export type ProcessStatus = "draft" | "active" | "under_review" | "inactive";

export interface Attachment {
  id: ID;
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: ISODateTime;
  uploadedBy: string;
}

export interface ProcessStep {
  id: ID;
  name: string;
  description: string;
  instructions: string;
  mandatory: boolean;
  /** Expected completion time in minutes. */
  expectedMinutes: number;
  evidenceRequired: boolean;
  approvalRequired: boolean;
}

/** One field-level change captured when a process definition is edited. */
export interface ProcessChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface ProcessVersion {
  version: number;
  changedAt: ISODateTime;
  changedBy: string;
  summary: string;
  /** Field-level diff (absent on older/seeded entries). */
  changes?: ProcessChange[];
}

/** Level at which a process is applied. */
export type ProcessApplicability = "department" | "team" | "employee";

/**
 * "Process applied for": which departments / teams / employees a process covers.
 *  - department → every active employee of the selected departments
 *  - team       → every active employee of the selected teams
 *  - employee   → only the selected employees
 */
export interface ProcessScope {
  level: ProcessApplicability;
  departmentIds: ID[];
  teamIds: ID[];
  employeeIds: ID[];
}

export type RiskLevel = "low" | "medium" | "high";

export interface ProcessReference {
  id: ID;
  title: string;
  url: string;
}

/** How a user-defined process KPI is filled in. */
export type KpiType = "number" | "percent" | "text" | "date" | "yes_no";

/** A KPI the process owner defines to manage the process (e.g. "Review score", "Approved by client"). */
export interface ProcessKpi {
  id: ID;
  name: string;
  type: KpiType;
  /** Target to reach ("" = none). Numbers/percents compare as >=, yes/no as "yes". */
  target: string;
  /** Free label, e.g. "days", "pts". */
  unit: string;
  description: string;
}

export type TrackedItemStatus = "not_started" | "in_progress" | "blocked" | "done";

/** One entry in an item's history; feeds its score. `from`/`to` are set for status, ETA and owner changes. */
export interface ItemEvent {
  at: ISODateTime;
  by: string;
  kind: "created" | "status" | "eta" | "owner" | "kpi" | "note";
  text: string;
  from?: string;
  to?: string;
}

/** One thing the process manages — e.g. a "Design" under a section — with its owner, ETA and KPI values. */
export interface TrackedItem {
  id: ID;
  title: string;
  section: string;
  details: string;
  ownerId: ID | null;
  eta: ISODate | null;
  status: TrackedItemStatus;
  /** KPI id → value as typed. */
  values: Record<string, string>;
  /** Running note for this item (replaces the separate action list). */
  note?: string;
  history?: ItemEvent[];
  createdById: ID | null;
  createdBy: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type ProcessActionStatus = "open" | "in_progress" | "done";

export interface ProcessActionItem {
  id: ID;
  title: string;
  notes: string;
  ownerId: ID | null;
  eta: ISODate | null;
  status: ProcessActionStatus;
  createdBy: string;
  createdAt: ISODateTime;
  completedAt: ISODateTime | null;
}

export interface Process {
  /** e.g. "PRC-001" */
  id: ID;
  name: string;
  categoryId: ID;
  description: string;
  objective: string;
  /** Owning department (null = organization-wide). */
  departmentId: ID | null;
  applicableTeamIds: ID[];
  applicableBandIds: ID[];
  ownerId: ID;
  responsibleId: ID | null;
  reviewerId: ID | null;
  frequency: Frequency;
  /** Interval in days when frequency === "custom". */
  customIntervalDays: number | null;
  effectiveDate: ISODate;
  expiryDate: ISODate | null;
  priority: Priority;
  /** Target compliance % for this process. */
  complianceThreshold: number;
  status: ProcessStatus;
  /** Mandatory processes produce "required" tasks for compliance. */
  isMandatory: boolean;
  /** Completion only counts once a reviewer approves. */
  requiresApproval: boolean;
  /** Process applied for (departments / teams / employees). */
  scope: ProcessScope;
  /** Kick-off / review meeting. */
  meetingDate: ISODate | null;
  meetingAgenda: string;
  meetingAttendeeIds: ID[];
  meetingNotes: string;
  /** Follow-up after the meeting. */
  followUpDate: ISODate | null;
  followUpAction: string;
  followUpOwnerId: ID | null;
  nextReviewDate: ISODate | null;
  lastReviewedOn: ISODate | null;
  riskLevel: RiskLevel;
  /** Target days to complete one occurrence (SLA). */
  slaDays: number | null;
  /** How success is measured. */
  successMetric: string;
  escalationContactId: ID | null;
  stakeholderIds: ID[];
  tags: string[];
  references: ProcessReference[];
  /** Internal remarks. */
  remarks: string;
  sopAttachment: Attachment | null;
  steps: ProcessStep[];
  version: number;
  versionHistory: ProcessVersion[];
  /** What the process tracks ("Design", "Release", …). Default "Item". */
  itemLabel?: string;
  kpis?: ProcessKpi[];
  items?: TrackedItem[];
  actions?: ProcessActionItem[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */

export type AssignmentLevel =
  | "organization"
  | "department"
  | "team"
  | "band"
  | "employee";

export type DueDateRule =
  /** Due on the last day of each period (week → Friday). */
  | "end_of_period"
  /** Due N days after the period starts. */
  | "days_after_start";

export interface DueDateConfig {
  rule: DueDateRule;
  /** Used with "days_after_start". */
  offsetDays: number;
  /** Grace days after due date before a task is considered overdue. */
  graceDays: number;
}

export interface Assignment {
  id: ID;
  processId: ID;
  level: AssignmentLevel;
  /** Narrowing filters (optional at most levels; required at their own level). */
  departmentId: ID | null;
  teamId: ID | null;
  bandId: ID | null;
  /** Explicit employees for the "employee" level. */
  employeeIds: ID[];
  startDate: ISODate;
  endDate: ISODate | null;
  frequency: Frequency;
  dueConfig: DueDateConfig;
  ownerId: ID;
  reviewerId: ID | null;
  status: RecordStatus;
  notes: string;
  /** "process_scope" = created/kept in sync by the process's "Applied for" settings. */
  source?: "manual" | "process_scope";
  createdAt: ISODateTime;
  createdBy: string;
}

/* ------------------------------------------------------------------ */
/* Compliance tasks                                                    */
/* ------------------------------------------------------------------ */

export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "completed"
  | "rejected"
  | "overdue"
  | "not_applicable"
  | "approved_exception";

export type TaskEventKind = "comment" | "status" | "review" | "evidence";

export interface TaskEvent {
  id: ID;
  kind: TaskEventKind;
  authorName: string;
  text: string;
  createdAt: ISODateTime;
}

/** One occurrence of an assigned process for one employee. */
export interface ComplianceTask {
  id: ID;
  assignmentId: ID;
  processId: ID;
  employeeId: ID;
  periodStart: ISODate;
  dueDate: ISODate;
  /**
   * Stored status. "overdue" is normally *derived* (see getEffectiveStatus)
   * from not_started/in_progress + past due date, but may also be stored.
   */
  status: TaskStatus;
  required: boolean;
  requiresApproval: boolean;
  completedStepIds: ID[];
  submittedAt: ISODateTime | null;
  reviewedAt: ISODateTime | null;
  reviewedBy: string | null;
  /** Reviewer quality rating, 1–5, set on approval. */
  qualityScore: number | null;
  remarks: string;
  evidence: Attachment[];
  history: TaskEvent[];
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Notifications, audit, users, settings                               */
/* ------------------------------------------------------------------ */

export type NotificationType =
  | "process_assigned"
  | "due_soon"
  | "overdue"
  | "submission_completed"
  | "submission_rejected"
  | "approval_pending"
  | "below_threshold";

export interface AppNotification {
  id: ID;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: ISODateTime;
  read: boolean;
  /** App roles that should see it; empty = everyone. */
  audienceRoles: AppRole[];
  /** If set, only this employee (and admins) see it. */
  recipientEmployeeId: ID | null;
  link: string;
}

export type AuditModule =
  | "Employees"
  | "Departments"
  | "Teams"
  | "Processes"
  | "Assignments"
  | "Compliance"
  | "Users"
  | "Master Data"
  | "Settings"
  | "Import"
  | "Organization"
  | "Ecosystem";

export interface AuditLog {
  id: ID;
  timestamp: ISODateTime;
  userName: string;
  userRole: AppRole;
  module: AuditModule;
  action: string;
  recordId: string;
  recordLabel: string;
  description: string;
}

export type AppRole =
  | "super_admin"
  | "senior_management"
  | "department_head"
  | "project_manager"
  | "team_supervisor"
  | "employee"
  | "administrator";

export interface AppUser {
  id: ID;
  name: string;
  email: string;
  role: AppRole;
  /** Linked employee record (drives data scope for non-admin roles). */
  employeeId: ID | null;
  status: RecordStatus;
  lastActiveAt: ISODateTime;
  /** Salted SHA-256 of the password. Absent = still on the default password. */
  passwordHash?: string;
}

export interface ComplianceThresholds {
  /** ≥ excellent → Excellent */
  excellent: number;
  /** ≥ good → Good (also the "compliant employee" cut-off) */
  good: number;
  /** ≥ needsImprovement → Needs Improvement; below → Critical */
  needsImprovement: number;
}

export type ComplianceTier = "excellent" | "good" | "needs_improvement" | "critical" | "na";

export interface NotificationPreference {
  inApp: boolean;
  email: boolean;
}

/** One summary tile ("KPI") on the Process Management screen. Super Admin defines them; everyone orders them for themselves. */
export interface HubTile {
  id: ID;
  label: string;
  metric: "processes" | "assignments" | "employees_covered" | "followups_due";
  /** processes: a ProcessStatus; assignments: "active" | "inactive". null = any. */
  status: string | null;
  /** processes only: healthy | at_risk | critical. null = any. */
  health: string | null;
  tone: "success" | "warning" | "danger" | "info" | "teal" | "neutral";
}

export interface AppSettings {
  thresholds: ComplianceThresholds;
  dateFormat: "dd MMM yyyy" | "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd";
  timeZone: string;
  theme: "light" | "dark" | "system";
  brandAccent: "teal" | "blue" | "navy";
  reportFooter: string;
  processConfig: {
    defaultThreshold: number;
    defaultFrequency: Frequency;
    evidenceRequiredByDefault: boolean;
    approvalRequiredByDefault: boolean;
    dueSoonDays: number;
    allowLateSubmission: boolean;
  };
  notificationPreferences: Record<NotificationType, NotificationPreference>;
  /** Side-menu entries hidden per role (see navKey). Absent = the role's default menu. */
  menuHidden?: Partial<Record<AppRole, string[]>>;
  /** Summary tiles on Process Management. Absent = the built-in set. */
  hubTiles?: HubTile[];
  /** KPI columns a Super Admin added to a screen's table grid. */
  gridColumns?: GridColumn[];
  /** Values typed into those columns, keyed `${columnId}|${rowId}`. */
  gridValues?: Record<string, string>;
}

/** A custom KPI column on a screen's table grid (see GRID_SCREENS). */
export interface GridColumn {
  id: ID;
  screen: string;
  name: string;
  type: KpiType;
  target: string;
  unit: string;
  description: string;
}

export interface ImportHistoryEntry {
  id: ID;
  fileName: string;
  importedAt: ISODateTime;
  importedBy: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

/** The complete mock database — one array per future table. */
/** A kind of thing in the business ecosystem (Product, Client, Module, Integration, POS System, or your own). */
export interface EcoType {
  id: ID;
  name: string;
  /** Colour used for its badges. */
  tone: "info" | "teal" | "success" | "warning" | "danger" | "neutral";
}

export type EcoStatus = "active" | "planned" | "inactive";

/** One thing in the ecosystem: a client, a module, a POS system, an integration… */
export interface EcoEntity {
  id: ID;
  typeId: ID;
  name: string;
  description: string;
  status: EcoStatus;
  /** Internal owner (an employee). */
  ownerId: ID | null;
  /** Primary contact person (often external, e.g. at a client or vendor). */
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** A free-form link between any two entities: "Client uses Module", "Integration integrates with POS"… */
export interface EcoRelation {
  id: ID;
  fromId: ID;
  toId: ID;
  /** What the link means, read from → to (e.g. "uses", "runs on", "part of"). */
  label: string;
  note: string;
  createdAt: ISODateTime;
}

export interface Database {
  schemaVersion: number;
  seededAt: ISODateTime;
  organization: Organization;
  departments: Department[];
  teams: Team[];
  bands: Band[];
  processCategories: ProcessCategory[];
  designations: Designation[];
  frequencies: FrequencyDefinition[];
  employees: Employee[];
  processes: Process[];
  assignments: Assignment[];
  tasks: ComplianceTask[];
  notifications: AppNotification[];
  auditLogs: AuditLog[];
  users: AppUser[];
  settings: AppSettings;
  importHistory: ImportHistoryEntry[];
  ecoTypes: EcoType[];
  ecoEntities: EcoEntity[];
  ecoRelations: EcoRelation[];
}

/* ------------------------------------------------------------------ */
/* Query / filter shapes shared by calculations and UI                 */
/* ------------------------------------------------------------------ */

export interface DateRange {
  from: ISODate;
  to: ISODate;
}

export interface AnalyticsFilter {
  range: DateRange;
  departmentId?: ID | null;
  teamId?: ID | null;
  employeeId?: ID | null;
  bandId?: ID | null;
  processId?: ID | null;
  processCategoryId?: ID | null;
  processStatus?: ProcessStatus | null;
}

/** Data visibility for the current demo role. null = unrestricted. */
export interface DataScope {
  departmentIds: ID[] | null;
  teamIds: ID[] | null;
  employeeIds: ID[] | null;
}
