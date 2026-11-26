/**
 * Seed assembler — builds the complete mock Database for a given "today".
 * This is the ONLY place mock data is combined; UI never imports seeds directly.
 */
import type { Database, ISODate } from "@/types";
import { buildAssignmentsSeed } from "./assignments";
import { buildAuditSeed } from "./audit-logs";
import { buildEcosystemSeed } from "./ecosystem";
import { bandsSeed } from "./bands";
import { buildComplianceSeed } from "./compliance";
import { departmentsSeed } from "./departments";
import { employeesSeed } from "./employees";
import { designationsSeed, frequenciesSeed, processCategoriesSeed } from "./master-data";
import { buildNotificationsSeed } from "./notifications";
import { organizationSeed } from "./organizations";
import { processesSeed } from "./processes";
import { applyProcessExtras } from "./process-extras";
import { settingsSeed } from "./settings";
import { teamsSeed } from "./teams";
import { buildUsersSeed } from "./users";

import { ensureAccounts } from "@/lib/auth/accounts";

export const SCHEMA_VERSION = 5;

export function buildSeedDatabase(today: ISODate): Database {
  const nowIso = `${today}T06:00:00.000Z`;
  const assignments = buildAssignmentsSeed(today);
  const processes = applyProcessExtras(processesSeed, today, assignments);
  const tasks = buildComplianceSeed(today, assignments, processes, employeesSeed, teamsSeed);
  const db: Database = {
    schemaVersion: SCHEMA_VERSION,
    seededAt: nowIso,
    organization: { ...organizationSeed },
    departments: departmentsSeed,
    teams: teamsSeed,
    bands: bandsSeed,
    processCategories: processCategoriesSeed,
    designations: designationsSeed,
    frequencies: frequenciesSeed,
    employees: employeesSeed,
    processes,
    assignments,
    tasks,
    notifications: buildNotificationsSeed(today, tasks, processes, employeesSeed, departmentsSeed),
    auditLogs: buildAuditSeed(today),
    users: buildUsersSeed(nowIso),
    settings: settingsSeed,
    importHistory: [
      { id: "IMP-0001", fileName: "employees_q3.xlsx", importedAt: `${today}T05:00:00.000Z`, importedBy: "Megha Rastogi", total: 6, created: 3, updated: 2, skipped: 1, failed: 0 },
    ],
    ...buildEcosystemSeed(employeesSeed, nowIso),
  };
  // Every employee gets a login account.
  return { ...db, users: ensureAccounts({ ...db, users: db.users }) };
}
