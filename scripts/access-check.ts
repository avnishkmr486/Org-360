/* Route access rules per role. Run: npx tsx scripts/access-check.ts */
import assert from "node:assert/strict";
import { canAccessPath } from "@/lib/navigation";

const cases: [role: Parameters<typeof canAccessPath>[0], path: string, allowed: boolean][] = [
  ["employee", "/processes", true],
  ["employee", "/processes/PRC-001", true],
  ["employee", "/processes/new", false],
  ["team_supervisor", "/processes/new", false],
  ["department_head", "/processes/new", true],
  ["employee", "/processes/PRC-001/edit", false],
  ["administrator", "/processes/PRC-001/edit", true],
  ["senior_management", "/processes/new", true],
  ["senior_management", "/employees/import", false],
  ["administrator", "/employees/import", true],
  ["team_supervisor", "/employees", true],
  ["employee", "/employees", false],
  ["employee", "/compliance/approvals", false],
  ["team_supervisor", "/compliance/approvals", true],
  ["employee", "/compliance/TSK-1", true],
  ["senior_management", "/master-data/bands", false],
  ["super_admin", "/master-data/bands", true],
  ["administrator", "/master-data/bands", false],
  ["administrator", "/database", false],
  ["super_admin", "/database", true],
  ["senior_management", "/database", false],
  ["super_admin", "/master-data", true],
  ["administrator", "/master-data", false],
  ["administrator", "/employees", true],
  ["department_head", "/employees", true],
  ["employee", "/dashboards/my", true],
  ["employee", "/dashboards/team", false],
  ["employee", "/ecosystem", false],
  ["team_supervisor", "/ecosystem/ECO-001", true],
];
for (const [role, path, allowed] of cases) assert.equal(canAccessPath(role, path), allowed, `${role} → ${path} should be ${allowed ? "allowed" : "blocked"}`);
console.log(`${cases.length} access rules OK`);
