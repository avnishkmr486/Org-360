import type { Assignment, AssignmentLevel, DueDateConfig, Frequency, ISODate } from "@/types";
import { addDaysISO } from "@/lib/utils/dates";

interface Def {
  id: string;
  processId: string;
  level: AssignmentLevel;
  departmentId?: string;
  teamId?: string;
  bandId?: string;
  employeeIds?: string[];
  /** Days before "today" that the assignment started. */
  startedDaysAgo: number;
  frequency: Frequency;
  due?: Partial<DueDateConfig>;
  ownerId: string;
  reviewerId?: string;
  createdBy: string;
}

const defs: Def[] = [
  { id: "ASG-001", processId: "PRC-012", level: "organization", startedDaysAgo: 400, frequency: "weekly", ownerId: "EMP-1047", createdBy: "Kavita Joshi" },
  { id: "ASG-002", processId: "PRC-011", level: "organization", startedDaysAgo: 75, frequency: "annually", due: { rule: "days_after_start", offsetDays: 30 }, ownerId: "EMP-1039", createdBy: "Arjun Reddy" },
  { id: "ASG-003", processId: "PRC-001", level: "department", departmentId: "DEP-02", startedDaysAgo: 70, frequency: "daily", ownerId: "EMP-1006", createdBy: "Vikram Malhotra" },
  { id: "ASG-004", processId: "PRC-002", level: "department", departmentId: "DEP-02", startedDaysAgo: 400, frequency: "weekly", ownerId: "EMP-1007", reviewerId: "EMP-1012", createdBy: "Karan Bhatia" },
  { id: "ASG-006", processId: "PRC-003", level: "team", departmentId: "DEP-01", teamId: "TEAM-01", startedDaysAgo: 400, frequency: "custom", due: { rule: "days_after_start", offsetDays: 2 }, ownerId: "EMP-1001", reviewerId: "EMP-1002", createdBy: "Ananya Sharma" },
  { id: "ASG-007", processId: "PRC-003", level: "team", departmentId: "DEP-02", teamId: "TEAM-02", startedDaysAgo: 400, frequency: "custom", due: { rule: "days_after_start", offsetDays: 2 }, ownerId: "EMP-1001", reviewerId: "EMP-1007", createdBy: "Ananya Sharma" },
  { id: "ASG-008", processId: "PRC-003", level: "team", departmentId: "DEP-02", teamId: "TEAM-03", startedDaysAgo: 400, frequency: "custom", due: { rule: "days_after_start", offsetDays: 2 }, ownerId: "EMP-1001", reviewerId: "EMP-1012", createdBy: "Ananya Sharma" },
  { id: "ASG-009", processId: "PRC-003", level: "team", departmentId: "DEP-03", teamId: "TEAM-04", startedDaysAgo: 400, frequency: "custom", due: { rule: "days_after_start", offsetDays: 2 }, ownerId: "EMP-1001", reviewerId: "EMP-1019", createdBy: "Ananya Sharma" },
  { id: "ASG-010", processId: "PRC-004", level: "team", departmentId: "DEP-03", teamId: "TEAM-04", startedDaysAgo: 400, frequency: "event_based", due: { rule: "days_after_start", offsetDays: 3 }, ownerId: "EMP-1018", reviewerId: "EMP-1039", createdBy: "Priya Nair" },
  { id: "ASG-011", processId: "PRC-004", level: "team", departmentId: "DEP-06", teamId: "TEAM-08", startedDaysAgo: 400, frequency: "event_based", due: { rule: "days_after_start", offsetDays: 3 }, ownerId: "EMP-1018", reviewerId: "EMP-1039", createdBy: "Priya Nair" },
  { id: "ASG-012", processId: "PRC-005", level: "department", departmentId: "DEP-03", startedDaysAgo: 400, frequency: "weekly", ownerId: "EMP-1019", reviewerId: "EMP-1018", createdBy: "Gaurav Mishra" },
  { id: "ASG-013", processId: "PRC-006", level: "team", departmentId: "DEP-04", teamId: "TEAM-05", startedDaysAgo: 400, frequency: "event_based", due: { rule: "days_after_start", offsetDays: 5 }, ownerId: "EMP-1025", reviewerId: "EMP-1024", createdBy: "Anjali Desai" },
  { id: "ASG-014", processId: "PRC-007", level: "team", departmentId: "DEP-04", teamId: "TEAM-06", startedDaysAgo: 400, frequency: "monthly", ownerId: "EMP-1029", reviewerId: "EMP-1025", createdBy: "Suresh Babu" },
  { id: "ASG-015", processId: "PRC-008", level: "department", departmentId: "DEP-05", startedDaysAgo: 400, frequency: "weekly", ownerId: "EMP-1033", reviewerId: "EMP-1034", createdBy: "Meera Iyer" },
  { id: "ASG-016", processId: "PRC-009", level: "team", departmentId: "DEP-06", teamId: "TEAM-08", startedDaysAgo: 120, frequency: "daily", ownerId: "EMP-1039", createdBy: "Arjun Reddy" },
  { id: "ASG-017", processId: "PRC-010", level: "employee", departmentId: "DEP-06", employeeIds: ["EMP-1041", "EMP-1042"], startedDaysAgo: 400, frequency: "monthly", due: { rule: "days_after_start", offsetDays: 9 }, ownerId: "EMP-1039", reviewerId: "EMP-1040", createdBy: "Arjun Reddy" },
  { id: "ASG-018", processId: "PRC-013", level: "department", departmentId: "DEP-07", startedDaysAgo: 400, frequency: "monthly", due: { rule: "days_after_start", offsetDays: 6 }, ownerId: "EMP-1043", reviewerId: "EMP-1044", createdBy: "Sanjay Mehta" },
  { id: "ASG-019", processId: "PRC-014", level: "band", bandId: "BAND-3", startedDaysAgo: 400, frequency: "quarterly", ownerId: "EMP-1047", reviewerId: "EMP-1047", createdBy: "Kavita Joshi" },
  { id: "ASG-020", processId: "PRC-014", level: "band", bandId: "BAND-4", startedDaysAgo: 400, frequency: "quarterly", ownerId: "EMP-1047", reviewerId: "EMP-1047", createdBy: "Kavita Joshi" },
  { id: "ASG-021", processId: "PRC-015", level: "department", departmentId: "DEP-08", startedDaysAgo: 400, frequency: "event_based", due: { rule: "days_after_start", offsetDays: 4 }, ownerId: "EMP-1047", reviewerId: "EMP-1048", createdBy: "Kavita Joshi" },
];

export function buildAssignmentsSeed(today: ISODate): Assignment[] {
  return defs.map((d) => {
    const startDate = addDaysISO(today, -d.startedDaysAgo);
    return {
      id: d.id,
      processId: d.processId,
      level: d.level,
      departmentId: d.departmentId ?? null,
      teamId: d.teamId ?? null,
      bandId: d.bandId ?? null,
      employeeIds: d.employeeIds ?? [],
      startDate,
      endDate: null,
      frequency: d.frequency,
      dueConfig: { rule: d.due?.rule ?? "end_of_period", offsetDays: d.due?.offsetDays ?? 0, graceDays: 0 },
      ownerId: d.ownerId,
      reviewerId: d.reviewerId ?? null,
      status: "active",
      notes: "",
      createdAt: `${startDate}T09:30:00.000Z`,
      createdBy: d.createdBy,
    };
  });
}
