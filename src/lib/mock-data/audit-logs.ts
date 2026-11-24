import type { AppRole, AuditLog, AuditModule, ISODate } from "@/types";
import { addDaysISO } from "@/lib/utils/dates";

type Row = [daysAgo: number, hour: number, user: string, role: AppRole, module: AuditModule, action: string, recordId: string, recordLabel: string, description: string];

const rows: Row[] = [
  [0, 9, "Megha Rastogi", "administrator", "Employees", "Updated", "EMP-1038", "Yash Thakur", "Employment status changed to On Leave."],
  [0, 8, "Karan Bhatia", "team_supervisor", "Compliance", "Approved", "PRC-002", "Code Review & Merge Approval", "Approved weekly code review submission for Neha Agarwal."],
  [0, 7, "Arjun Reddy", "department_head", "Assignments", "Assigned", "ASG-002", "Information Security Awareness Acknowledgement", "Process assigned at organization level (48 employees)."],
  [1, 12, "Anjali Desai", "project_manager", "Compliance", "Rejected", "PRC-007", "Data Migration Validation", "Rejected submission — sample value checks missing."],
  [1, 10, "Amit Kumar", "employee", "Compliance", "Submitted", "PRC-012", "Weekly Timesheet Submission", "Weekly timesheet submitted."],
  [1, 9, "Vikram Malhotra", "department_head", "Departments", "Updated", "DEP-02", "Engineering", "Department description updated."],
  [2, 15, "Kavita Joshi", "department_head", "Processes", "Updated", "PRC-015", "New Joiner Onboarding Checklist", "Added optional 'Buddy assigned' step (v2)."],
  [2, 11, "Platform Super Admin", "super_admin", "Users", "Role Changed", "USR-10", "Rakesh Sinha", "Role changed to Team Supervisor."],
  [3, 14, "Priya Nair", "department_head", "Processes", "Created", "PRC-004", "Release Readiness Checklist", "Process created with 4 steps."],
  [3, 10, "Megha Rastogi", "administrator", "Import", "Imported", "IMP-0001", "employees_q3.xlsx", "Employee import: 3 created, 2 updated, 1 skipped."],
  [4, 13, "Sanjay Mehta", "senior_management", "Settings", "Updated", "SETTINGS", "Compliance thresholds", "Good threshold confirmed at 85%."],
  [5, 9, "Naveen Kumar", "team_supervisor", "Compliance", "Approved", "PRC-010", "Backup & Disaster Recovery Verification", "Approved monthly DR verification for Sonal Mathur."],
  [6, 16, "Megha Rastogi", "administrator", "Employees", "Created", "EMP-1015", "Nikhil Bansal", "Employee record created."],
  [7, 11, "Ananya Sharma", "department_head", "Teams", "Updated", "TEAM-01", "Product Strategy & Design", "Team supervisor assigned: Rahul Verma."],
  [8, 10, "Meera Iyer", "department_head", "Assignments", "Assigned", "ASG-015", "Support Ticket SLA Review", "Process assigned to Customer Support department."],
  [9, 12, "Platform Super Admin", "super_admin", "Master Data", "Created", "CAT-08", "Finance & Governance", "Process category created."],
  [10, 15, "Rohit Kapoor", "department_head", "Teams", "Created", "TEAM-06", "Integrations & Data Migration", "Team created under Implementation."],
  [12, 9, "Megha Rastogi", "administrator", "Employees", "Deactivated", "EMP-1050", "Vivek Dubey", "Employee deactivated (resigned)."],
  [14, 14, "Sanjay Mehta", "senior_management", "Processes", "Created", "PRC-013", "Monthly Revenue Reconciliation", "Process created with approval workflow."],
  [16, 10, "Kavita Joshi", "department_head", "Organization", "Updated", "ORG-ALTA", "Altametrics Pvt Ltd.", "Organization profile updated."],
  [20, 11, "Platform Super Admin", "super_admin", "Users", "Created", "USR-13", "Imran Sheikh", "User account created with Employee role."],
];

export function buildAuditSeed(today: ISODate): AuditLog[] {
  return rows.map(([daysAgo, hour, userName, userRole, module, action, recordId, recordLabel, description], i) => ({
    id: `AUD-${String(rows.length - i).padStart(4, "0")}`,
    timestamp: `${addDaysISO(today, -daysAgo)}T${String(hour - 5).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00.000Z`,
    userName,
    userRole,
    module,
    action,
    recordId,
    recordLabel,
    description,
  }));
}
