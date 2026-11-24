import type { Team } from "@/types";

const CREATED = "2024-04-15T09:00:00.000Z";

const rows: [id: string, name: string, departmentId: string, supervisorId: string | null, pmId: string | null, description: string][] = [
  ["TEAM-01", "Product Strategy & Design", "DEP-01", "EMP-1002", null, "Roadmap, requirements, UX research and design system."],
  ["TEAM-02", "Platform Engineering", "DEP-02", "EMP-1007", "EMP-1017", "Core platform services, APIs, data pipelines and integrations framework."],
  ["TEAM-03", "Back-Office Applications", "DEP-02", "EMP-1012", "EMP-1017", "Inventory, labor scheduling and reporting modules."],
  ["TEAM-04", "QA Automation", "DEP-03", "EMP-1019", null, "Automated regression, release certification and defect triage."],
  ["TEAM-05", "Enterprise Onboarding", "DEP-04", "EMP-1026", "EMP-1025", "Go-live programs for multi-unit restaurant chains."],
  ["TEAM-06", "Integrations & Data Migration", "DEP-04", "EMP-1029", "EMP-1025", "POS/ERP integrations and historical data migration."],
  ["TEAM-07", "Customer Success Desk", "DEP-05", "EMP-1034", null, "Tier-1/Tier-2 support desk and SLA management."],
  ["TEAM-08", "Cloud Operations", "DEP-06", "EMP-1040", null, "Production monitoring, backups, incident response."],
  ["TEAM-09", "Finance & Revenue Operations", "DEP-07", "EMP-1044", null, "Billing, reconciliation and revenue reporting."],
  ["TEAM-10", "People Operations", "DEP-08", "EMP-1048", null, "Hiring, onboarding, policies and employee experience."],
];

/**
 * Teams added from the Department → Team list provided by the business.
 * They have no supervisor or members yet — assign them from Team Management.
 * (QA / CS in that list are the existing Quality Assurance / Customer Support departments.)
 */
const D = { DEV: "DEP-09", OPS: "DEP-10", DB: "DEP-11", PS: "DEP-12", AUTO: "DEP-13", DC: "DEP-14", UIUX: "DEP-15", TRN: "DEP-16", DM: "DEP-17", QA: "DEP-03", CS: "DEP-05" } as const;

const ADDED: [department: string, team: string][] = [
  [D.DEV, "Back Office"], [D.OPS, "Ops and HR"], [D.DB, "DB Team"], [D.DEV, "QuantumDev"], [D.PS, "Plum"],
  [D.PS, "CS"], [D.DEV, "Mobile Team"], [D.PS, "Any Connector"], [D.AUTO, "Automation"], [D.DEV, "Altametrics Growth"],
  [D.DC, "Datacenter"], [D.DEV, "Customerology"], [D.QA, "Altametrics Growth"], [D.PS, "Peru"], [D.DC, "APM"],
  [D.PS, "Altametrics Growth"], [D.PS, "Teal"], [D.PS, "Xformity"], [D.PS, "TW"], [D.UIUX, "IntentOps"],
  [D.OPS, "Accounts"], [D.DEV, "Any Connector"], [D.PS, "Market Hub"], [D.DEV, "Utility"], [D.QA, "Teal"],
  [D.PS, "IntentOps"], [D.QA, "Plum"], [D.OPS, "Admin"], [D.DC, "Networks"], [D.QA, "NextGen BO"],
  [D.DC, "Systems"], [D.AUTO, "Data Science"], [D.QA, "Any Connector"], [D.TRN, "Trainer"], [D.PS, "CS-Mobile"],
  [D.UIUX, "XD"], [D.QA, "IntentOps"], [D.QA, "Peru"], [D.QA, "Market Hub"], [D.DM, "SEO"],
  [D.CS, "CS"], [D.PS, "CW"], [D.PS, "Training"], [D.QA, "Training"],
];

ADDED.forEach(([departmentId, name], i) => rows.push([`TEAM-${String(11 + i)}`, name, departmentId, null, null, ""]));

export const teamsSeed: Team[] = rows.map(([id, name, departmentId, supervisorId, projectManagerId, description]) => ({
  id,
  name,
  description,
  departmentId,
  supervisorId,
  projectManagerId,
  status: "active",
  createdAt: CREATED,
  updatedAt: CREATED,
}));
