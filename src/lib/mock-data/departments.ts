import type { Department } from "@/types";

const CREATED = "2024-04-01T09:00:00.000Z";

const rows: [id: string, code: string, name: string, headId: string | null, description: string][] = [
  ["DEP-01", "PM", "Product Management", "EMP-1001", "Owns product strategy, roadmaps, requirements and UX for the restaurant back-office suite."],
  ["DEP-02", "ENG", "Engineering", "EMP-1006", "Designs, builds and maintains the platform and back-office application modules."],
  ["DEP-03", "QA", "Quality Assurance", "EMP-1018", "Assures release quality through automated and manual testing practices."],
  ["DEP-04", "IMP", "Implementation", "EMP-1024", "Onboards restaurant chains, configures modules and migrates customer data."],
  ["DEP-05", "CS", "Customer Support", "EMP-1033", "Resolves customer tickets and maintains SLA commitments for US-based clients."],
  ["DEP-06", "DEVOPS", "DevOps & Infrastructure", "EMP-1039", "Runs cloud infrastructure, monitoring, backups and disaster recovery."],
  ["DEP-07", "BIZOPS", "Business Operations", "EMP-1043", "Leads finance, revenue operations and organization-wide governance."],
  ["DEP-08", "HR", "Administration & HR", "EMP-1047", "Manages people operations, onboarding, policies and administration."],
  // Added from the department list provided by the business (QA and CS already exist as DEP-03 / DEP-05).
  // No head, teams or employees yet — assign them from Organization / Master Data.
  ["DEP-09", "DEV", "Development", null, "Product development."],
  ["DEP-10", "OPS", "Operations", null, "Day-to-day operations."],
  ["DEP-11", "DB", "DB", null, "Database team."],
  ["DEP-12", "PS", "PS", null, "PS team."],
  ["DEP-13", "AUTO", "Automation", null, "Test and process automation."],
  ["DEP-14", "DC", "DC", null, "DC team."],
  ["DEP-15", "UIUX", "UI-UX", null, "User interface and experience design."],
  ["DEP-16", "TRN", "Trainer", null, "Training and enablement."],
  ["DEP-17", "DM", "Digital Marketing", null, "Digital marketing."],
];

export const departmentsSeed: Department[] = rows.map(([id, code, name, headId, description]) => ({
  id,
  code,
  name,
  description,
  headId,
  status: "active",
  createdAt: CREATED,
  updatedAt: CREATED,
}));
