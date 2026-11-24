import type { AppNotification, ComplianceTask, Department, Employee, ISODate, Process } from "@/types";
import { computeStats, getEffectiveStatus, groupStats } from "@/lib/calculations/compliance";
import { addDaysISO } from "@/lib/utils/dates";

/** Derive realistic sample notifications that link to real seed records. */
export function buildNotificationsSeed(
  today: ISODate,
  tasks: ComplianceTask[],
  processes: Process[],
  employees: Employee[],
  departments: Department[],
): AppNotification[] {
  const proc = new Map(processes.map((p) => [p.id, p]));
  const emp = new Map(employees.map((e) => [e.id, e]));
  const name = (id: string) => {
    const e = emp.get(id);
    return e ? `${e.firstName} ${e.lastName}` : id;
  };
  const out: AppNotification[] = [];
  let n = 0;
  const push = (x: Omit<AppNotification, "id" | "read"> & { read?: boolean }) =>
    out.push({ id: `NTF-${String(++n).padStart(3, "0")}`, read: false, ...x });
  const ts = (daysAgo: number, hour: number) => `${addDaysISO(today, -daysAgo)}T${String(hour).padStart(2, "0")}:15:00.000Z`;

  push({
    type: "process_assigned",
    title: "New process assigned",
    message: `${proc.get("PRC-011")?.name} has been assigned to the whole organization.`,
    createdAt: ts(0, 4),
    audienceRoles: [],
    recipientEmployeeId: null,
    link: "/processes?tab=assignments",
  });

  const sorted = [...tasks].sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));

  // Due soon
  sorted
    .filter((t) => t.status === "not_started" && t.dueDate > today && t.dueDate <= addDaysISO(today, 3))
    .filter((_, i) => i % 9 === 0)
    .slice(0, 4)
    .forEach((t, i) =>
      push({
        type: "due_soon",
        title: "Process approaching due date",
        message: `${proc.get(t.processId)?.name} for ${name(t.employeeId)} is due on ${t.dueDate}.`,
        createdAt: ts(0, 3 + i),
        audienceRoles: [],
        recipientEmployeeId: t.employeeId,
        link: `/compliance/${encodeURIComponent(t.id)}`,
      }),
    );

  // Overdue
  sorted
    .filter((t) => getEffectiveStatus(t, today) === "overdue" && t.dueDate >= addDaysISO(today, -10))
    .filter((_, i) => i % 3 === 0)
    .slice(0, 5)
    .forEach((t, i) =>
      push({
        type: "overdue",
        title: "Process overdue",
        message: `${name(t.employeeId)} has not completed ${proc.get(t.processId)?.name} (due ${t.dueDate}).`,
        createdAt: ts(i % 3, 2 + i),
        audienceRoles: ["super_admin", "senior_management", "department_head", "team_supervisor", "project_manager", "employee", "administrator"],
        recipientEmployeeId: t.employeeId,
        link: `/compliance/${encodeURIComponent(t.id)}`,
      }),
    );

  // Approvals pending
  sorted
    .filter((t) => t.status === "submitted")
    .slice(0, 4)
    .forEach((t, i) =>
      push({
        type: "approval_pending",
        title: "Approval pending",
        message: `${name(t.employeeId)} submitted ${proc.get(t.processId)?.name}. Review required.`,
        createdAt: ts(i % 2, 6 + i),
        audienceRoles: ["super_admin", "senior_management", "department_head", "team_supervisor", "project_manager", "administrator"],
        recipientEmployeeId: null,
        link: `/compliance/${encodeURIComponent(t.id)}`,
      }),
    );

  // Submissions completed
  sorted
    .filter((t) => t.status === "completed" && t.dueDate <= today && t.dueDate >= addDaysISO(today, -5))
    .filter((_, i) => i % 11 === 0)
    .slice(0, 3)
    .forEach((t, i) =>
      push({
        type: "submission_completed",
        title: "Submission completed",
        message: `${name(t.employeeId)} completed ${proc.get(t.processId)?.name}.`,
        createdAt: ts(1 + i, 9),
        read: i > 0,
        audienceRoles: [],
        recipientEmployeeId: t.employeeId,
        link: `/compliance/${encodeURIComponent(t.id)}`,
      }),
    );

  // Rejected
  sorted
    .filter((t) => t.status === "rejected" && t.dueDate >= addDaysISO(today, -30))
    .slice(0, 3)
    .forEach((t, i) =>
      push({
        type: "submission_rejected",
        title: "Submission rejected",
        message: `${proc.get(t.processId)?.name} for ${name(t.employeeId)} was rejected: ${t.remarks}`,
        createdAt: ts(2 + i, 7),
        read: i === 2,
        audienceRoles: [],
        recipientEmployeeId: t.employeeId,
        link: `/compliance/${encodeURIComponent(t.id)}`,
      }),
    );

  // Departments below threshold (last 30 days)
  const recent = tasks.filter((t) => t.dueDate >= addDaysISO(today, -30) && t.dueDate <= today);
  const byDept = groupStats(recent, (t) => emp.get(t.employeeId)?.departmentId, today);
  departments.forEach((d, i) => {
    const s = byDept.get(d.id) ?? computeStats([], today);
    if (s.compliance !== null && s.compliance < 85) {
      push({
        type: "below_threshold",
        title: "Compliance below threshold",
        message: `${d.name} compliance is ${s.compliance.toFixed(1)}% over the last 30 days (target 85%).`,
        createdAt: ts(1, 3 + i),
        audienceRoles: ["super_admin", "senior_management", "department_head", "administrator"],
        recipientEmployeeId: null,
        link: `/departments/${d.id}`,
      });
    }
  });

  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
