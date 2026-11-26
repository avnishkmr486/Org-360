/**
 * Business-logic & repository smoke tests (no browser needed).
 * Run: npx tsx scripts/logic-tests.ts
 */
import assert from "node:assert/strict";
import type { ComplianceTask } from "@/types";
import { getDb, resetDb, TODAY } from "@/lib/store/mock-db";
import {
  computeStats,
  computeParticipation,
  getEffectiveStatus,
  getTier,
  pct,
} from "@/lib/calculations/compliance";
import { getDashboardMetrics } from "@/lib/calculations/dashboard";
import { evaluateHealth } from "@/lib/calculations/process-health";
import { importEmployeesWithMaster } from "@/lib/repositories/employee-import";
import { analyzeRecords, buildRecords, DEFAULT_OPTIONS, type Analysis } from "@/features/employees/import/validate";
import { autoMapHeaders } from "@/features/employees/import/fields";
import { tableFromMatrix } from "@/lib/import/sheet-parser";
import * as repo from "@/lib/repositories";
import { addDaysISO, resolvePreset } from "@/lib/utils/dates";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

const base: ComplianceTask = {
  id: "T",
  assignmentId: "A",
  processId: "P",
  employeeId: "E1",
  periodStart: "2026-01-01",
  dueDate: "2026-01-05",
  status: "not_started",
  required: true,
  requiresApproval: false,
  completedStepIds: [],
  submittedAt: null,
  reviewedAt: null,
  reviewedBy: null,
  qualityScore: null,
  remarks: "",
  evidence: [],
  history: [],
  updatedAt: "",
};
const t = (patch: Partial<ComplianceTask>): ComplianceTask => ({ ...base, ...patch, id: Math.random().toString(36) });
const today = "2026-02-01";

async function main() {
  console.log("Compliance engine rules");
  await test("division by zero returns null (N/A, never 0%)", () => {
    assert.equal(pct(0, 0), null);
    assert.equal(computeStats([], today).compliance, null);
  });
  await test("unsubmitted past-due tasks count against compliance and derive to overdue", () => {
    const s = computeStats([t({ status: "completed", submittedAt: "2026-01-04T00:00:00Z" }), t({ status: "not_started" })], today);
    assert.equal(s.compliance, 50);
    assert.equal(s.overdue, 1);
    assert.equal(getEffectiveStatus(t({ status: "in_progress" }), today), "overdue");
  });
  await test("approved exceptions and not-applicable are excluded", () => {
    const s = computeStats([t({ status: "completed" }), t({ status: "approved_exception" }), t({ status: "not_applicable" })], today);
    assert.equal(s.due, 1);
    assert.equal(s.compliance, 100);
  });
  await test("rejected submissions do not count as completed", () => {
    const s = computeStats([t({ status: "rejected", submittedAt: "2026-01-04T00:00:00Z" }), t({ status: "completed" })], today);
    assert.equal(s.compliance, 50);
  });
  await test("approval-required tasks count only after approval", () => {
    const pending = t({ status: "submitted", requiresApproval: true, submittedAt: "2026-01-04T00:00:00Z" });
    const unreviewedCompleted = t({ status: "completed", requiresApproval: true, reviewedAt: null });
    const approved = t({ status: "completed", requiresApproval: true, reviewedAt: "2026-01-06T00:00:00Z" });
    assert.equal(computeStats([pending, unreviewedCompleted, approved], today).compliance, 33.3);
  });
  await test("future tasks are not in the denominator until completed", () => {
    const s = computeStats([t({ dueDate: "2026-03-01" }), t({ status: "completed" })], today);
    assert.equal(s.due, 1);
  });
  await test("non-required tasks are ignored by compliance", () => {
    assert.equal(computeStats([t({ required: false })], today).compliance, null);
  });
  await test("participation = employees with a submission / employees expected", () => {
    const p = computeParticipation([t({ employeeId: "E1", status: "rejected", submittedAt: "x" }), t({ employeeId: "E2" })], today);
    assert.deepEqual(p, { expected: 2, participated: 1, rate: 50 });
  });
  await test("tiers follow configurable thresholds", () => {
    assert.equal(getTier(95), "excellent");
    assert.equal(getTier(94.99), "good");
    assert.equal(getTier(84.99), "needs_improvement");
    assert.equal(getTier(69.9), "critical");
    assert.equal(getTier(null), "na");
    assert.equal(getTier(90, { excellent: 98, good: 92, needsImprovement: 80 }), "needs_improvement");
  });

  console.log("Dashboard metrics");
  resetDb();
  await test("all KPIs derive from the dataset and are internally consistent", () => {
    const db = getDb();
    const m = getDashboardMetrics(db, { range: resolvePreset("last_30", TODAY) }, null, TODAY);
    assert.equal(m.kpis.totalEmployees, 50);
    assert.equal(m.kpis.departments, db.departments.filter((d) => d.status === "active").length);
    assert.equal(db.departments.length, 17);
    assert.equal(m.kpis.teams, db.teams.filter((t) => t.status === "active").length);
    assert.equal(db.teams.length, 54);
    assert.equal(m.kpis.activeProcesses, 15);
    const k = m.kpis;
    assert.equal(k.compliantEmployees.value! + k.nonCompliantEmployees.value! + k.noApplicableTasks, k.activeEmployees);
    assert.equal(m.distribution.reduce((a, d) => a + d.count, 0) + k.noApplicableTasks, k.activeEmployees);
    assert.ok(m.insights.length >= 5, "insights generated");
    console.log(`    compliance ${k.compliance.value}% · participation ${k.participation.value}% · overdue ${k.overdueTasks.value}`);
  });
  await test("department filter narrows every KPI", () => {
    const m = getDashboardMetrics(getDb(), { range: resolvePreset("last_30", TODAY), departmentId: "DEP-06" }, null, TODAY);
    assert.equal(m.kpis.departments, 1);
    assert.equal(m.kpis.totalEmployees, 4);
  });
  await test("role scope restricts data (team supervisor sees one team)", () => {
    const m = getDashboardMetrics(getDb(), { range: resolvePreset("last_30", TODAY) }, { departmentIds: null, teamIds: ["TEAM-02"], employeeIds: null }, TODAY);
    assert.equal(m.kpis.teams, 1);
    assert.ok(m.employeesInScope.every((e) => e.teamId === "TEAM-02"));
  });

  console.log("Repository write flows");
  await test("create assignment (team level) resolves employees and generates tasks", async () => {
    const before = getDb().tasks.length;
    const res = await repo.createAssignment({
      processId: "PRC-005", level: "team", departmentId: "DEP-02", teamId: "TEAM-03", bandId: null, employeeIds: [],
      startDate: TODAY, endDate: null, frequency: "weekly", dueConfig: { rule: "end_of_period", offsetDays: 0, graceDays: 0 },
      ownerId: "EMP-1019", reviewerId: "EMP-1018", notes: "",
    });
    assert.equal(res.employees, 6);
    assert.ok(res.tasks > 0);
    assert.equal(getDb().tasks.length, before + res.tasks);
    assert.equal(getDb().notifications[0].type, "process_assigned");
    assert.equal(getDb().auditLogs[0].module, "Assignments");
  });
  await test("submission blocked until mandatory steps + evidence, then goes to review", async () => {
    const task = getDb().tasks.find((x) => x.processId === "PRC-002" && x.status === "not_started" && x.dueDate > TODAY)!;
    await assert.rejects(repo.submitTask(task.id), /mandatory steps/);
    const proc = getDb().processes.find((p) => p.id === "PRC-002")!;
    for (const s of proc.steps) await repo.toggleStep(task.id, s.id, true);
    await assert.rejects(repo.submitTask(task.id), /evidence/);
    await repo.addEvidence(task.id, { name: "pr-link.pdf", size: 1200, type: "application/pdf" });
    assert.equal(await repo.submitTask(task.id, "Done"), "submitted");
    await assert.rejects(repo.reviewTask(task.id, "reject", "  "), /Remarks are required/);
    await repo.reviewTask(task.id, "approve", "Looks good", 5);
    const after = getDb().tasks.find((x) => x.id === task.id)!;
    assert.equal(after.status, "completed");
    assert.equal(after.qualityScore, 5);
    assert.ok(after.reviewedAt);
  });
  await test("rejection keeps the task out of completed and notifies the employee", async () => {
    const task = getDb().tasks.find((x) => x.status === "submitted")!;
    await repo.reviewTask(task.id, "reject", "Evidence missing");
    const after = getDb().tasks.find((x) => x.id === task.id)!;
    assert.equal(after.status, "rejected");
    assert.equal(getDb().notifications[0].type, "submission_rejected");
    assert.equal(getDb().notifications[0].recipientEmployeeId, task.employeeId);
  });
  await test("exceptions require justification", async () => {
    const task = getDb().tasks.find((x) => x.status === "not_started")!;
    await assert.rejects(repo.setTaskStatus(task.id, "approved_exception", ""), /justification/);
    await repo.setTaskStatus(task.id, "approved_exception", "Customer reschedule");
    assert.equal(getDb().tasks.find((x) => x.id === task.id)!.status, "approved_exception");
  });
  await test("process update bumps version and records history; clone creates a draft", async () => {
    const p = await repo.updateProcess("PRC-001", { complianceThreshold: 92 }, "Raised threshold");
    assert.equal(p.version, 2);
    assert.equal(p.versionHistory.at(-1)!.summary, "Raised threshold");
    const c = await repo.cloneProcess("PRC-001");
    assert.equal(c.status, "draft");
    assert.notEqual(c.steps[0].id, p.steps[0].id);
  });

  console.log("Employee import safeguards");
  await test("import never silently overwrites and never deletes missing employees", async () => {
    const before = getDb().employees.length;
    const existing = getDb().employees.find((e) => e.id === "EMP-1009")!;
    const { createdAt: _c, updatedAt: _u, ...input } = existing;
    void _c; void _u;
    const summary = await repo.importEmployees(
      [
        { employee: { ...input, id: "EMP-2001", email: "new.person@altametrics.example", firstName: "New" }, action: "create" },
        { employee: { ...input, firstName: "Changed" }, action: "create" }, // existing ID without opt-in → skipped
      ],
      { fileName: "test.xlsx", skipped: 0, failed: 1 },
    );
    assert.deepEqual({ c: summary.created, u: summary.updated, s: summary.skipped, f: summary.failed }, { c: 1, u: 0, s: 1, f: 1 });
    assert.equal(getDb().employees.find((e) => e.id === "EMP-1009")!.firstName, "Amit");
    assert.equal(getDb().employees.length, before + 1);
    assert.equal(getDb().importHistory[0].fileName, "test.xlsx");
  });
  await test("explicit update opt-in updates the existing record", async () => {
    const existing = getDb().employees.find((e) => e.id === "EMP-1009")!;
    const { createdAt: _c, updatedAt: _u, ...input } = existing;
    void _c; void _u;
    const s = await repo.importEmployees([{ employee: { ...input, phone: "+91 9000000000" }, action: "update" }], { fileName: "u.csv", skipped: 0, failed: 0 });
    assert.equal(s.updated, 1);
    assert.equal(getDb().employees.find((e) => e.id === "EMP-1009")!.phone, "+91 9000000000");
  });
  await test("employee with compliance history cannot be hard-deleted", async () => {
    await assert.rejects(repo.deleteEmployee("EMP-1009"), /Deactivate instead/);
  });
  await test("duplicate employee ID on create is rejected", async () => {
    const e = getDb().employees[0];
    const { createdAt: _c, updatedAt: _u, ...input } = e;
    void _c; void _u;
    await assert.rejects(repo.createEmployee(input), /already exists/);
  });

  console.log("Bulk delete");
  resetDb();
  // No foreign key anywhere may point at a record that no longer exists.
  const assertNoDanglingRefs = async () => {
    const { TABLES, tableRows } = await import("@/features/database/schema");
    const db = getDb();
    const ids = (t: string) => new Set(tableRows(db, TABLES.find((x) => x.name === t)!).map((r) => String(r.id)));
    for (const t of TABLES) {
      for (const [col, target] of Object.entries(t.fks)) {
        if (target === "frequencies") continue;
        const valid = ids(target);
        for (const row of tableRows(db, t)) {
          const v = row[col];
          for (const ref of Array.isArray(v) ? v : [v]) {
            if (ref === null || ref === undefined || ref === "") continue;
            assert.ok(valid.has(String(ref)), `${t.name}.${col} -> ${String(ref)} dangles (no such ${target})`);
          }
        }
      }
    }
  };
  await test("deleting an unused record removes only that record and audits it", async () => {
    const a = await repo.createDepartment({ name: "Temp A", code: "TA", description: "", headId: null, status: "active" });
    const b = await repo.createDepartment({ name: "Temp B", code: "TB", description: "", headId: null, status: "active" });
    const before = getDb().departments.length;
    const impact = repo.previewDelete(getDb(), "departments", [a.id, b.id]);
    assert.equal(repo.hasDependents(impact), false);
    const res = await repo.bulkDelete("departments", [a.id, b.id]);
    assert.deepEqual([res.deleted, res.alsoRemoved, res.cleared], [2, 0, 0]);
    assert.equal(getDb().departments.length, before - 2);
    assert.ok(getDb().auditLogs.some((x) => x.action === "Bulk Deleted"));
  });
  await test("deleting a department (with permission) also deletes its teams, employees, processes, assignments and tasks", async () => {
    const dept = getDb().departments.find((d) => getDb().employees.some((e) => e.departmentId === d.id) && getDb().tasks.length)!.id;
    const impact = repo.previewDelete(getDb(), "departments", [dept]);
    assert.ok(repo.hasDependents(impact));
    assert.ok(impact.removed.some((r) => /Employee/.test(r.label)));
    const res = await repo.bulkDelete("departments", [dept]);
    const db = getDb();
    assert.equal(res.deleted, 1);
    assert.ok(res.alsoRemoved > 0);
    assert.ok(!db.departments.some((d) => d.id === dept));
    assert.ok(!db.employees.some((e) => e.departmentId === dept));
    assert.ok(!db.teams.some((t) => t.departmentId === dept));
    assert.ok(!db.processes.some((p) => p.departmentId === dept));
    assert.ok(!db.assignments.some((a) => a.departmentId === dept));
    assert.ok(db.auditLogs.some((a) => a.action === "Cascade Deleted"));
    await assertNoDanglingRefs();
  });
  resetDb();
  await test("deleting employees removes their tasks and clears manager / head / reviewer links", async () => {
    const victims = getDb().employees.slice(0, 5).map((e) => e.id);
    const res = await repo.bulkDelete("employees", victims);
    const db = getDb();
    assert.equal(res.deleted, 5);
    assert.ok(!db.tasks.some((t) => victims.includes(t.employeeId)));
    assert.ok(!db.users.some((u) => u.employeeId && victims.includes(u.employeeId)));
    await assertNoDanglingRefs();
  });
  resetDb();
  await test("deleting a team, a band and a process category each cascade without dangling references", async () => {
    for (const [kind, table] of [["teams", "teams"], ["bands", "bands"], ["processCategories", "processCategories"]] as const) {
      resetDb();
      const id = (getDb()[table] as { id: string }[])[0].id;
      const res = await repo.bulkDelete(kind, [id]);
      assert.equal(res.deleted, 1);
      assert.ok(!(getDb()[table] as { id: string }[]).some((x) => x.id === id));
      await assertNoDanglingRefs();
    }
  });
  resetDb();
  await test("designations: seeded, assigned, unique by name, and deleting one clears it from employees", async () => {
    const db0 = getDb();
    assert.ok(db0.designations.length >= 70);
    const used = db0.employees.find((e) => e.designationId)!;
    assert.ok(used, "seed employees have designations");
    assert.ok(db0.designations.every((d) => d.summary && (d.responsibilities ?? "").split("\n").length >= 3), "every designation has a role profile");
    await repo.updateEmployee(used.id, { responsibilities: "Owns the release checklist" });
    assert.equal(getDb().employees.find((e) => e.id === used.id)?.responsibilities, "Owns the release checklist");
    await assert.rejects(repo.upsertMasterRecord("designations", { name: db0.designations[0].name.toUpperCase(), description: "", status: "active" }), /already exists/);
    const added = await repo.upsertMasterRecord("designations", { name: "Chief Coffee Officer", description: "", status: "active" });
    assert.match(added.id, /^DES-/);
    assert.ok(repo.findDeleteBlockers(getDb(), "designations").has(used.designationId!));
    await repo.bulkDelete("designations", [used.designationId!]);
    assert.ok(!getDb().employees.some((e) => e.designationId === used.designationId));
    assert.ok(getDb().employees.some((e) => e.id === used.id), "employees are kept");
    await assertNoDanglingRefs();
  });
  resetDb();
  await test("deleting everything of one kind leaves a consistent database", async () => {
    await repo.bulkDelete("departments", getDb().departments.map((d) => d.id));
    assert.equal(getDb().departments.length, 0);
    assert.equal(getDb().employees.length, 0);
    await assertNoDanglingRefs();
  });

  console.log("Login accounts");
  resetDb();
  await test("every employee has an account; roles come from what they lead, otherwise employee", async () => {
    const db = getDb();
    for (const e of db.employees) assert.ok(db.users.some((u) => u.employeeId === e.id), `no account for ${e.id}`);
    const { defaultRoleFor } = await import("@/lib/auth/accounts");
    const head = db.departments.find((d) => d.headId)!.headId!;
    assert.equal(defaultRoleFor(head, db), "department_head");
    assert.equal(defaultRoleFor("NOBODY", db), "employee");
    assert.equal(db.users.find((u) => u.id === "USR-07")!.role, "administrator");
  });
  await test("a new employee (create and import) gets an account", async () => {
    const e = getDb().employees[0];
    const { createdAt: _c, updatedAt: _u, ...input } = e;
    void _c; void _u;
    await repo.createEmployee({ ...input, id: "2011-256", email: "new.person@altametrics.example", firstName: "New", lastName: "Person", reportingManagerId: null });
    assert.equal(getDb().users.find((u) => u.employeeId === "2011-256")?.role, "employee");
    await repo.importEmployees([{ employee: { ...input, id: "2011-257", email: "", firstName: "Imp", lastName: "Orted", reportingManagerId: null }, action: "create" }], { fileName: "x.csv", skipped: 0, failed: 0 });
    assert.ok(getDb().users.some((u) => u.employeeId === "2011-257"));
  });
  await test("sign in by Employee ID or email; wrong password, unknown user and disabled accounts fail", async () => {
    const { DEFAULT_PASSWORD } = await import("@/lib/auth/accounts");
    const byId = await repo.signIn("emp-1009", DEFAULT_PASSWORD);
    assert.ok(byId.ok && byId.user.role === "employee");
    const byMail = await repo.signIn("Megha.Rastogi@altametrics.example", DEFAULT_PASSWORD);
    assert.ok(byMail.ok && byMail.user.role === "administrator");
    assert.equal((await repo.signIn("EMP-1009", "wrong")).ok, false);
    assert.equal((await repo.signIn("NOBODY", DEFAULT_PASSWORD)).ok, false);
    await repo.updateUser("USR-06", { status: "inactive" });
    const off = await repo.signIn("EMP-1009", DEFAULT_PASSWORD);
    assert.ok(!off.ok && /disabled/.test(off.error));
    await repo.updateUser("USR-06", { status: "active" });
  });
  await test("changing a password replaces the default; reset restores it; hashes are never shown", async () => {
    const { DEFAULT_PASSWORD } = await import("@/lib/auth/accounts");
    await assert.rejects(repo.changePassword("USR-06", "wrong", "NewPass#123"), /incorrect/);
    await assert.rejects(repo.changePassword("USR-06", DEFAULT_PASSWORD, "short"), /at least/);
    await repo.changePassword("USR-06", DEFAULT_PASSWORD, "NewPass#123");
    assert.equal((await repo.signIn("EMP-1009", DEFAULT_PASSWORD)).ok, false);
    assert.equal((await repo.signIn("EMP-1009", "NewPass#123")).ok, true);
    const { TABLES, tableRows } = await import("@/features/database/schema");
    const shown = tableRows(getDb(), TABLES.find((t) => t.name === "users")!).find((r) => r.id === "USR-06")!;
    assert.equal(shown.passwordHash, "••••••••");
    await repo.resetPassword("USR-06");
    assert.equal((await repo.signIn("EMP-1009", DEFAULT_PASSWORD)).ok, true);
  });
  await test("a signed-in role only reaches what it is allowed to", async () => {
    const { canAccessPath } = await import("@/lib/navigation");
    const emp = getDb().users.find((u) => u.id === "USR-06")!;
    assert.equal(canAccessPath(emp.role, "/users"), false);
    assert.equal(canAccessPath(emp.role, "/master-data"), false);
    assert.equal(canAccessPath(emp.role, "/dashboards/my"), true);
  });

  console.log("Process tracking");
  resetDb();
  await test("owners define KPIs; involved employees add items and fill KPIs; others are read-only", async () => {
    const { setUiState } = await import("@/lib/store/ui-store");
    const { processAccess } = await import("@/lib/auth/process-access");
    const db0 = getDb();
    const proc = db0.processes.find((p) => db0.tasks.some((t) => t.processId === p.id))!;
    const owner = db0.users.find((u) => u.employeeId === proc.ownerId)!;
    const doer = db0.users.find((u) => u.role === "employee" && u.employeeId && u.employeeId !== proc.ownerId && db0.tasks.some((t) => t.processId === proc.id && t.employeeId === u.employeeId))!;
    const outsider = db0.users.find((u) => u.role === "employee" && u.employeeId && !db0.tasks.some((t) => t.processId === proc.id && t.employeeId === u.employeeId) && u.employeeId !== proc.ownerId)!;
    assert.ok(owner && doer && outsider);

    // The employee doing the work cannot define KPIs ...
    setUiState({ currentUserId: doer.id });
    await assert.rejects(repo.saveKpi(proc.id, { name: "Score", type: "number", target: "8", unit: "", description: "" }), /Super Admin/);
    // ... and neither can the owner: KPIs are a Super Admin job.
    setUiState({ currentUserId: owner.id });
    await assert.rejects(repo.saveKpi(proc.id, { name: "Score", type: "number", target: "8", unit: "pts", description: "" }), /Super Admin/);
    setUiState({ currentUserId: "USR-01" });
    await repo.saveKpi(proc.id, { name: "Score", type: "number", target: "8", unit: "pts", description: "" });
    await assert.rejects(repo.saveKpi(proc.id, { name: "score", type: "number", target: "", unit: "", description: "" }), /already exists/);
    setUiState({ currentUserId: owner.id });
    await repo.setItemLabel(proc.id, "Design");
    const kpi = getDb().processes.find((p) => p.id === proc.id)!.kpis![0];

    // The involved employee adds a design with ETA and fills the KPI.
    setUiState({ currentUserId: doer.id });
    await repo.saveItem(proc.id, { title: "Login screen", section: "Auth", details: "v1", ownerId: null, eta: "2030-01-31", status: "in_progress", values: { [kpi.id]: "9", bogus: "x" } });
    let item = getDb().processes.find((p) => p.id === proc.id)!.items![0];
    assert.equal(item.ownerId, doer.employeeId);
    assert.deepEqual(item.values, { [kpi.id]: "9" });
    await repo.saveItem(proc.id, { id: item.id, title: "Login screen", section: "Auth", details: "v2", ownerId: item.ownerId, eta: "2030-02-15", status: "done", values: { [kpi.id]: "10" } });
    item = getDb().processes.find((p) => p.id === proc.id)!.items![0];
    assert.equal(item.status, "done");
    assert.equal(item.eta, "2030-02-15");

    // Inline edits are logged, and the history feeds the item score.
    const { scoreItem } = await import("@/lib/utils/item-health");
    const procNow = () => getDb().processes.find((p) => p.id === proc.id)!;
    assert.ok(item.history!.some((e) => e.kind === "eta" && e.from === "2030-01-31" && e.to === "2030-02-15"));
    assert.ok(item.history!.some((e) => e.kind === "status" && e.to === "done"));
    let sc = scoreItem(item, procNow().kpis!, "2026-01-01");
    assert.equal(sc.health, "done");
    assert.deepEqual(sc.factors.map((f) => f.points), [40, 40, 15]); // on time, KPI met, ETA pushed once
    await repo.updateItem(proc.id, item.id, { status: "blocked", note: "Waiting on client", values: { [kpi.id]: "4" } });
    item = procNow().items![0];
    assert.equal(item.note, "Waiting on client");
    assert.equal(item.values[kpi.id], "4");
    assert.ok(item.history!.some((e) => e.kind === "kpi") && item.history!.some((e) => e.kind === "note"));
    const before = item.history!.length;
    await repo.updateItem(proc.id, item.id, { note: "Waiting on client" }); // no real change -> nothing logged
    assert.equal(procNow().items![0].history!.length, before);
    sc = scoreItem(item, procNow().kpis!, "2026-01-01");
    assert.ok(sc.health !== "done" && sc.score < 95); // blocked, below target
    const late = scoreItem({ ...item, status: "in_progress", eta: "2025-12-20" }, procNow().kpis!, "2026-01-01");
    assert.equal(late.health, "off_track");
    assert.equal(late.lateDays, 12);
    setUiState({ currentUserId: doer.id });

    // Someone not involved at all sees it but cannot add anything.
    setUiState({ currentUserId: outsider.id });
    const db = getDb();
    const out = processAccess(db, outsider.role, outsider.employeeId, db.processes.find((p) => p.id === proc.id)!);
    assert.deepEqual(out, { manage: false, contribute: false });
    await assert.rejects(repo.updateItem(proc.id, item.id, { status: "done" }), /update/);
    await assert.rejects(repo.saveItem(proc.id, { title: "Sneaky", section: "", details: "", ownerId: null, eta: null, status: "not_started", values: {} }), /permission/);

    // Removing a KPI also clears its values from items; the owner runs the action list.
    setUiState({ currentUserId: owner.id });
    await repo.saveAction(proc.id, { title: "Share design with client", notes: "", ownerId: doer.employeeId, eta: "2030-03-01", status: "open" });
    const action = getDb().processes.find((p) => p.id === proc.id)!.actions![0];
    setUiState({ currentUserId: doer.id });
    await repo.setActionStatus(proc.id, action.id, "done");
    assert.equal(getDb().processes.find((p) => p.id === proc.id)!.actions![0].status, "done");
    await assert.rejects(repo.saveAction(proc.id, { title: "x", notes: "", ownerId: null, eta: null, status: "open" }), /permission/);
    setUiState({ currentUserId: owner.id });
    await assert.rejects(repo.removeKpi(proc.id, kpi.id), /Super Admin/);
    setUiState({ currentUserId: "USR-01" });
    await repo.removeKpi(proc.id, kpi.id);
    assert.deepEqual(getDb().processes.find((p) => p.id === proc.id)!.items![0].values, {});

    // Process Management tiles: Super Admin only, names unique
    const tile = { id: "TILE-test", label: "Under review", metric: "processes" as const, status: "under_review", health: null, tone: "info" as const };
    setUiState({ currentUserId: owner.id });
    await assert.rejects(repo.saveHubTiles([tile]), /Super Admin/);
    setUiState({ currentUserId: "USR-01" });
    await assert.rejects(repo.saveHubTiles([tile, { ...tile, id: "TILE-2", label: "under review" }]), /two KPIs/);
    await repo.saveHubTiles([tile]);
    assert.deepEqual(getDb().settings.hubTiles?.map((t) => t.label), ["Under review"]);

    // KPI columns on a screen's table grid: Super Admin defines, values saved, delete clears them
    const gc = { screen: "employees", name: "CSAT", type: "number" as const, target: "4", unit: "pts", description: "" };
    setUiState({ currentUserId: owner.id });
    await assert.rejects(repo.saveGridColumn(gc), /Super Admin/);
    setUiState({ currentUserId: "USR-01" });
    await repo.saveGridColumn(gc);
    await assert.rejects(repo.saveGridColumn({ ...gc, name: "csat" }), /already has/);
    const col = getDb().settings.gridColumns![0];
    await repo.saveGridColumn({ ...col, name: "CSAT score" });
    assert.equal(getDb().settings.gridColumns![0].name, "CSAT score");
    await repo.saveGridColumn({ ...gc, name: "Second" });
    await repo.moveGridColumn(getDb().settings.gridColumns![1].id, -1);
    assert.deepEqual(getDb().settings.gridColumns!.map((c) => c.name), ["Second", "CSAT score"]);
    await repo.removeGridColumn(getDb().settings.gridColumns![0].id);
    await repo.setGridValue(col.id, "EMP-001", "4.5");
    assert.equal(getDb().settings.gridValues![`${col.id}|EMP-001`], "4.5");
    setUiState({ currentUserId: owner.id });
    await assert.rejects(repo.setGridValue(col.id, "EMP-001", "1"), /permission/);
    await assert.rejects(repo.removeGridColumn(col.id), /Super Admin/);
    setUiState({ currentUserId: "USR-01" });
    await repo.removeGridColumn(col.id);
    assert.equal(getDb().settings.gridColumns!.length, 0);
    assert.deepEqual(getDb().settings.gridValues, {});
    setUiState({ currentUserId: "USR-02" });
  });

  console.log("Ecosystem");
  resetDb();
  await test("clients belong to one or many products; Back Office clients are seeded", async () => {
    const byName = (n: string) => getDb().ecoEntities.find((e) => e.name === n)!;
    const typeName = (id: string) => getDb().ecoTypes.find((t) => t.id === id)?.name;
    const products = ["Back Office", "Growth", "Plum", "BI"].map(byName);
    assert.ok(products.every((p) => typeName(p.typeId) === "Product"));
    const backOffice = byName("Back Office");
    for (const n of ["CSC", "JITB", "LC", "Outback", "PeetsCoffee", "Noodles", "BWW", "Arbys", "Bobby Cox", "Rosas Cafe", "TACOBELL", "DENNYS", "CHIPOTLE", "SNS", "Mel.Mushroom", "GOLDEN_CHICK", "BOJANGLES", "McDonalds"]) {
      const c = byName(n);
      assert.equal(typeName(c.typeId), "Client");
      assert.ok(getDb().ecoRelations.some((r) => r.fromId === c.id && r.toId === backOffice.id), `${n} is linked to Back Office`);
    }
    const clientType = getDb().ecoTypes.find((t) => t.name === "Client")!.id;
    const base = { typeId: clientType, description: "", status: "active" as const, ownerId: null, contactName: "", contactEmail: "", contactPhone: "", notes: "" };
    await assert.rejects(repo.saveEntity({ ...base, name: "Test Client" }), /at least one product/);
    const id = await repo.saveEntity({ ...base, name: "Test Client", productIds: [backOffice.id, byName("BI").id] });
    const linked = () => getDb().ecoRelations.filter((r) => r.fromId === id).map((r) => r.toId).sort();
    assert.deepEqual(linked(), [backOffice.id, byName("BI").id].sort());
    await repo.saveEntity({ ...base, id, name: "Test Client", productIds: [byName("Growth").id] });
    assert.deepEqual(linked(), [byName("Growth").id]);
    resetDb();
  });
  await test("entries link freely in any direction, answer who-uses-what, and deleting cleans up", async () => {
    const { setUiState } = await import("@/lib/store/ui-store");
    const { groupLinksByType, usageMatrix, ecosystemStats, referencesTo } = await import("@/lib/calculations/ecosystem");
    const db0 = getDb();
    assert.ok(db0.ecoEntities.length > 15 && db0.ecoRelations.length > 30);
    const byName = (n: string) => getDb().ecoEntities.find((e) => e.name === n)!;
    const client = byName("Blue Ember Grill");
    const square = byName("Square");

    // Who uses Square? (links point client -> POS; the lookup works from the POS side)
    const usedBy = groupLinksByType(getDb(), square.id).find((g) => g.type.name === "Client")!.items.map((i) => i.other.name);
    assert.ok(usedBy.includes("Cedar & Co. Cafés") && !usedBy.includes("Blue Ember Grill"));
    assert.equal(await repo.linkEntities(client.id, [square.id], "runs on"), 1);
    assert.equal(await repo.linkEntities(client.id, [square.id], "RUNS ON"), 0); // same link again is ignored
    assert.ok(groupLinksByType(getDb(), square.id).find((g) => g.type.name === "Client")!.items.some((i) => i.other.id === client.id));
    await assert.rejects(repo.linkEntities(client.id, [client.id], "uses"), /at least one other/);

    // Matrix: client x POS system, either direction
    const t = (n: string) => getDb().ecoTypes.find((x) => x.name === n)!.id;
    const m = usageMatrix(getDb(), t("Client"), t("POS System"));
    assert.equal(m.cell(client, square).length, 1);
    assert.equal(m.cell(client, byName("Clover")).length, 0);

    // Free-form types and entries; a type in use cannot be deleted
    await repo.saveEcoType({ name: "Region", tone: "neutral" });
    await assert.rejects(repo.saveEcoType({ name: "region", tone: "info" }), /already exists/);
    const regionId = t("Region");
    const rid = await repo.saveEntity({ typeId: regionId, name: "EMEA", description: "", status: "active", ownerId: null, contactName: "", contactEmail: "", contactPhone: "", notes: "" });
    await assert.rejects(repo.removeEcoType(regionId), /use/);
    await assert.rejects(repo.saveEntity({ typeId: regionId, name: "emea", description: "", status: "active", ownerId: null, contactName: "", contactEmail: "bad", contactPhone: "", notes: "" }), /already exists/);
    await repo.linkEntities(rid, [client.id], "covers");
    assert.ok(ecosystemStats(getDb()).noOwner.some((e) => e.id === rid));

    // Entries that are referenced can only be deleted by a Super Admin; managers must remove the links first
    const manager = getDb().users.find((u) => u.role === "project_manager")!;
    setUiState({ currentUserId: manager.id });
    await assert.rejects(repo.removeEntities([client.id]), /Remove the links first/);
    assert.ok(getDb().ecoEntities.some((e) => e.id === client.id), "blocked delete changes nothing");
    const lone = await repo.saveEntity({ typeId: regionId, name: "Lonely", description: "", status: "active", ownerId: null, contactName: "", contactEmail: "", contactPhone: "", notes: "" });
    assert.deepEqual(await repo.removeEntities([lone]), { entities: 1, links: 0 });
    setUiState({ currentUserId: "USR-02" });
    await assert.rejects(repo.removeEntities([client.id]), /Remove the links first/);
    assert.equal(referencesTo(getDb(), [client.id]).length, getDb().ecoRelations.filter((r) => r.fromId === client.id || r.toId === client.id).length);

    // Deleting an entry removes its links and nothing else
    const before = getDb().ecoRelations.length;
    const mine = getDb().ecoRelations.filter((r) => r.fromId === client.id || r.toId === client.id).length;
    setUiState({ currentUserId: "USR-01" });
    const res = await repo.removeEntities([client.id]);
    setUiState({ currentUserId: "USR-02" });
    assert.deepEqual(res, { entities: 1, links: mine });
    assert.equal(getDb().ecoRelations.length, before - mine);
    await assertNoDanglingRefs();

    // A type that entries use: only a Super Admin can delete it, and its entries and links go with it
    const emea2 = await repo.saveEntity({ typeId: regionId, name: "APAC", description: "", status: "active", ownerId: null, contactName: "", contactEmail: "", contactPhone: "", notes: "" });
    await repo.linkEntities(emea2, [rid], "sits beside");
    await assert.rejects(repo.removeEcoType(regionId, true), /use/);
    setUiState({ currentUserId: "USR-01" });
    await assert.rejects(repo.removeEcoType(regionId), /use/);
    await repo.removeEcoType(regionId, true);
    setUiState({ currentUserId: "USR-02" });
    assert.ok(!getDb().ecoTypes.some((x) => x.id === regionId));
    assert.ok(!getDb().ecoEntities.some((e) => e.typeId === regionId));
    await assertNoDanglingRefs();

    // Deleting an employee clears the owner it held
    const owned = getDb().ecoEntities.find((e) => e.ownerId)!;
    await repo.bulkDelete("employees", [owned.ownerId!]);
    assert.equal(getDb().ecoEntities.find((e) => e.id === owned.id)!.ownerId, null);
    await assertNoDanglingRefs();

    // Employees may not edit
    const emp = getDb().users.find((u) => u.role === "employee")!;
    setUiState({ currentUserId: emp.id });
    await assert.rejects(repo.saveEntity({ typeId: regionId, name: "APAC", description: "", status: "active", ownerId: null, contactName: "", contactEmail: "", contactPhone: "", notes: "" }), /permission/);
    setUiState({ currentUserId: "USR-02" });
  });

  console.log("Menu configuration");
  await test("hidden menu entries are removed per role; Settings stays for Super Admin; section order", async () => {
    const { navForRole, navKey, NAV_SECTIONS } = await import("@/lib/navigation");
    const labels = NAV_SECTIONS.map((s) => s.label);
    assert.ok(labels.indexOf("Organization") === labels.indexOf("Process & Compliance") + 1);
    const full = navForRole("administrator");
    const hideTop = navForRole("administrator", ["/teams", "/master-data>/master-data/teams"]);
    assert.ok(full.flatMap((s) => s.items).some((i) => i.href === "/teams"));
    assert.ok(!hideTop.flatMap((s) => s.items).some((i) => i.href === "/teams"));
    const hideSuper = navForRole("super_admin", ["/master-data>/master-data/teams"]);
    const md = hideSuper.flatMap((s) => s.items).find((i) => i.href === "/master-data")!;
    assert.ok(!md.children!.some((c) => c.href === "/master-data/teams") && md.children!.length > 0);
    const sa = navForRole("super_admin", ["/settings"]);
    assert.ok(sa.flatMap((s) => s.items).some((i) => i.href === "/settings"));
    assert.equal(navKey({ href: "/a" }, { href: "/b" }), "/a>/b");
  });
  await test("only Super Admin can configure the menu", async () => {
    const { can } = await import("@/lib/auth/permissions");
    assert.equal(can("super_admin", "menu.configure"), true);
    assert.equal(can("administrator", "menu.configure"), false);
  });

  console.log("Bulk add & database schema");
  resetDb();
  await test("bulk add creates all valid rows with sequential ids and audits them", async () => {
    const before = getDb().processCategories.length;
    const n = await repo.bulkCreate("processCategories", [
      { name: "Bulk One", description: "" },
      { name: "", description: "" },
      { name: "Bulk Two", description: "x" },
    ]);
    assert.equal(n, 2);
    assert.equal(getDb().processCategories.length, before + 2);
    assert.ok(getDb().auditLogs.some((a) => a.recordLabel === "Bulk Two" && a.action === "Created"));
  });
  await test("bulk add is all-or-nothing and reports duplicates per row", async () => {
    const before = getDb().processCategories.length;
    const rows = [{ name: "Fresh One" }, { name: "bulk one" }, { name: "Fresh One" }];
    const errs = repo.validateBulkCreate(getDb(), "processCategories", rows);
    assert.deepEqual([...errs.keys()], [1, 2]);
    await assert.rejects(repo.bulkCreate("processCategories", rows), /Row 2/);
    assert.equal(getDb().processCategories.length, before);
  });
  await test("bulk add validates teams (department) and bands (level)", async () => {
    assert.equal(repo.validateBulkCreate(getDb(), "teams", [{ name: "T", departmentId: "NOPE" }]).get(0), "Unknown department.");
    assert.match(repo.validateBulkCreate(getDb(), "bands", [{ name: "B", code: "BX", level: "0" }]).get(0)!, /Level/);
  });
  await test("every database table is described by the structure screen", async () => {
    const { TABLES, tableRows, inferColumns } = await import("@/features/database/schema");
    const keys = Object.keys(getDb()).filter((k) => k !== "schemaVersion" && k !== "seededAt").sort();
    assert.deepEqual(TABLES.map((t) => t.name).sort(), keys);
    for (const t of TABLES) {
      const cols = inferColumns(tableRows(getDb(), t), t);
      for (const fkCol of Object.keys(t.fks)) assert.ok(cols.some((c) => c.name === fkCol), `${t.name}.${fkCol} not found in data`);
    }
  });

  console.log("Employee import with master data (Department / Band) and optional email");
  resetDb();
  const analyzeFile = (matrix: string[][]) => {
    const t = tableFromMatrix(matrix, 0);
    const { mapping } = autoMapHeaders(t.headers, t.rows);
    return analyzeRecords(buildRecords(t.rows, mapping), getDb(), TODAY, { ...DEFAULT_OPTIONS, defaults: { status: "Active", dateOfJoining: TODAY } });
  };
  const commitRows = (a: Analysis) => a.rows.filter((r) => r.state === "valid").map((r) => ({ employee: r.resolved!, action: "create" as const }));
  const counts = () => ({ emp: getDb().employees.length, dept: getDb().departments.length, bands: getDb().bands.length, bandLevels: getDb().bands.map((b) => b.level), audit: getDb().auditLogs.length, hist: getDb().importHistory.length });
  const peopleFile = [
    ["Name", "Department", "Band"],
    ["Asha Verma", "Data Science", "B6"],
    ["Ravi Nair", "Data Science", "B6"],
    ["Tina Das", "Engg", "B2"],
  ];
  await test("creates the Department / Band and the employees in one step; ids are substituted", async () => {
    const before = counts();
    const a = analyzeFile(peopleFile);
    assert.ok(a.rows.every((r) => r.state === "valid"), JSON.stringify(a.rows.map((r) => r.errors)));
    assert.equal(a.masterPlan.total, 2);
    const res = await importEmployeesWithMaster(a.masterPlan, commitRows(a), { fileName: "people.xlsx", skipped: 0, failed: 0 });
    assert.equal(res.created, 3);
    assert.deepEqual(res.createdMaster.departments.map((d) => d.name), ["Data Science"]);
    // Level 6 is already used by band L6, so the new B6 band gets the next free level.
    assert.deepEqual(res.createdMaster.bands.map((b) => [b.code, b.level]), [["B6", Math.max(...before.bandLevels) + 1]]);
    const db = getDb();
    assert.equal(db.departments.length, before.dept + 1);
    assert.equal(db.bands.length, before.bands + 1);
    const dep = db.departments.find((d) => d.name === "Data Science")!;
    assert.deepEqual([dep.id, dep.code, dep.status, dep.headId], ["DEP-18", "DS", "active", null]);
    const band = db.bands.find((b) => b.code === "B6")!;
    assert.equal(band.status, "active");
    const asha = db.employees.find((e) => e.firstName === "Asha")!;
    assert.deepEqual([asha.departmentId, asha.bandId, asha.email], [dep.id, band.id, ""]);
    const tina = db.employees.find((e) => e.firstName === "Tina")!;
    assert.equal(tina.departmentId, "DEP-02", "'Engg' was mapped to Engineering, not created");
    assert.ok(db.employees.every((e) => ![e.departmentId, e.bandId].some((id) => id.startsWith("__new"))), "no synthetic ids leak into the data");
    assert.equal(db.employees.length, before.emp + 3);
    assert.equal(db.importHistory.length, before.hist + 1);
  });
  await test("audit trail: one 'Created' entry per master record plus the import entry that mentions them", () => {
    const logs = getDb().auditLogs.slice(0, 6);
    assert.ok(logs.some((l) => l.module === "Departments" && l.action === "Created" && l.recordLabel === "Data Science" && /people\.xlsx/.test(l.description)));
    assert.ok(logs.some((l) => l.module === "Master Data" && l.action === "Created" && /Band 6/.test(l.recordLabel)));
    const imp = logs.find((l) => l.module === "Import")!;
    assert.match(imp.description, /3 created/);
    assert.match(imp.description, /Master data created: 1 department\(s\), 1 band\(s\)/);
  });
  await test("a master record that appeared in the meantime is reused, never duplicated", async () => {
    resetDb();
    const stale = analyzeFile(peopleFile);
    const second = analyzeFile([["Employee ID", "Name", "Department", "Band"], ["EMP-3001", "Meera Joshi", "Data Science", "B6"]]);
    await importEmployeesWithMaster(stale.masterPlan, commitRows(stale), { fileName: "a.xlsx", skipped: 0, failed: 0 });
    const afterFirst = counts();
    const res = await importEmployeesWithMaster(second.masterPlan, commitRows(second), { fileName: "b.xlsx", skipped: 0, failed: 0 });
    assert.equal(res.created, 1);
    assert.deepEqual([res.createdMaster.departments.length, res.createdMaster.bands.length], [0, 0]);
    assert.equal(getDb().departments.length, afterFirst.dept);
    assert.equal(getDb().bands.length, afterFirst.bands);
    assert.equal(getDb().employees.find((e) => e.id === "EMP-3001")!.departmentId, getDb().departments.find((d) => d.name === "Data Science")!.id);
  });
  await test("re-reading the same file after import: new values are now found, typos stay mapped, nothing is left to create", () => {
    const again = analyzeFile(peopleFile);
    assert.equal(again.masterPlan.total, 0);
    assert.deepEqual(again.unknown.map((u) => u.value), ["Engg"], "only the typo is still 'unknown'");
    assert.ok(again.unknown.every((u) => u.decision.action === "map"));
    assert.ok(again.rows.every((r) => r.state === "valid"));
  });
  await test("if anything is wrong nothing is imported — neither master data nor employees", async () => {
    resetDb();
    const a = analyzeFile([["Name", "Department", "Band"], ["Quentin Vale", "Quantum Ops", "B8"]]);
    const before = counts();
    const broken = { ...a.masterPlan, departments: [] };
    await assert.rejects(importEmployeesWithMaster(broken, commitRows(a), { fileName: "bad.xlsx", skipped: 0, failed: 0 }), /not part of the import plan/);
    assert.deepEqual(counts(), before, "no department, band, employee, audit or history change");
  });
  await test("master data and employees are never deleted by an import", async () => {
    resetDb();
    const before = getDb();
    const a = analyzeFile(peopleFile);
    await importEmployeesWithMaster(a.masterPlan, commitRows(a), { fileName: "x.xlsx", skipped: 0, failed: 0 });
    for (const d of before.departments) assert.ok(getDb().departments.some((x) => x.id === d.id));
    for (const b of before.bands) assert.ok(getDb().bands.some((x) => x.id === b.id));
    for (const e of before.employees) assert.ok(getDb().employees.some((x) => x.id === e.id));
  });
  await test("employees with a blank email can be created and edited; several may share it; real emails stay unique", async () => {
    resetDb();
    const src = getDb().employees.find((e) => e.id === "EMP-1001")!;
    const { createdAt: _c, updatedAt: _u, ...input } = src;
    void _c; void _u;
    const a = await repo.createEmployee({ ...input, id: "EMP-4001", email: "" });
    const b = await repo.createEmployee({ ...input, id: "EMP-4002", email: "" });
    assert.deepEqual([a.email, b.email], ["", ""]);
    await repo.updateEmployee("EMP-4001", { phone: "+91 9000000009" });
    await repo.updateEmployee("EMP-4001", { email: "emp4001@x.com" });
    await repo.updateEmployee("EMP-4001", { email: "" });
    await repo.updateEmployee("EMP-4001", { email: "emp4001@x.com" });
    await assert.rejects(repo.updateEmployee("EMP-4002", { email: "EMP4001@X.COM" }), /already used/);
    await assert.rejects(repo.createEmployee({ ...input, id: "EMP-4003", email: "emp4001@x.com" }), /already used/);
  });

  console.log("Settings validation");
  await test("thresholds must be ordered", async () => {
    await assert.rejects(repo.updateSettings({ thresholds: { excellent: 80, good: 85, needsImprovement: 70 } }), /Thresholds/);
  });

  console.log("Process scope, health & audit trail");
  resetDb();
  await test("seeded 'applied for' scope mirrors real assignments: saving it creates nothing new", async () => {
    const before = { tasks: getDb().tasks.length, asg: getDb().assignments.length };
    const p = getDb().processes.find((x) => x.id === "PRC-002")!;
    const res = await repo.applyProcessScope("PRC-002", p.scope);
    assert.equal(res.created, 0);
    assert.equal(getDb().tasks.length, before.tasks);
    assert.equal(getDb().assignments.length, before.asg);
  });
  await test("adding a department to the scope assigns only uncovered employees (no double assignment)", async () => {
    const p = getDb().processes.find((x) => x.id === "PRC-005")!;
    const res = await repo.applyProcessScope("PRC-005", { ...p.scope, departmentIds: [...p.scope.departmentIds, "DEP-06"] });
    assert.equal(res.created, 1);
    const active = getDb().assignments.filter((a) => a.processId === "PRC-005" && a.status === "active");
    const seen = new Map<string, number>();
    for (const t of getDb().tasks.filter((x) => x.processId === "PRC-005")) {
      const k = `${t.employeeId}|${t.dueDate}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    assert.ok([...seen.values()].every((n) => n === 1), "no duplicate tasks for the same employee and due date");
    assert.ok(active.some((a) => a.source === "process_scope"));
    assert.ok(getDb().tasks.some((t) => t.processId === "PRC-005" && getDb().employees.find((e) => e.id === t.employeeId)?.departmentId === "DEP-06"));
  });
  await test("removing a department deactivates only the scope-managed assignment", async () => {
    const p = getDb().processes.find((x) => x.id === "PRC-005")!;
    const res = await repo.applyProcessScope("PRC-005", { ...p.scope, departmentIds: ["DEP-03"] });
    assert.equal(res.deactivated, 1);
    assert.ok(getDb().assignments.find((a) => a.id === "ASG-012")!.status === "active", "manual assignment untouched");
  });
  await test("scope validation: level needs matching selections", async () => {
    await assert.rejects(repo.applyProcessScope("PRC-005", { level: "team", departmentIds: ["DEP-03"], teamIds: [], employeeIds: [] }), /at least one team/i);
    await assert.rejects(repo.applyProcessScope("PRC-005", { level: "employee", departmentIds: ["DEP-03"], teamIds: [], employeeIds: [] }), /at least one employee/i);
    await assert.rejects(repo.applyProcessScope("PRC-005", { level: "department", departmentIds: [], teamIds: [], employeeIds: [] }), /department/i);
  });
  await test("editing a process records a field-level diff in version history and audit", async () => {
    const p = await repo.updateProcess("PRC-009", { meetingDate: "2030-01-10", followUpDate: "2030-01-20", riskLevel: "high" });
    const last = p.versionHistory.at(-1)!;
    assert.ok(last.changes!.some((c) => c.field === "followUpDate" && c.to === "2030-01-20"));
    assert.ok(last.changes!.some((c) => c.field === "riskLevel" && c.from === "medium" && c.to === "high"));
    assert.match(getDb().auditLogs[0].description, /v\d+/);
  });
  await test("new processes get an auto-generated sequential ID", async () => {
    const src = getDb().processes.find((x) => x.id === "PRC-001")!;
    const { id: _i, version: _v, versionHistory: _h, createdAt: _c, updatedAt: _u, ...input } = src;
    void _i; void _v; void _h; void _c; void _u;
    const created = await repo.createProcess({ ...input, name: "Brand New Process", status: "draft" });
    assert.equal(created.id, "PRC-016");
  });
  await test("health: meets target = healthy; overdue follow-up downgrades; far below = critical; draft = not active", () => {
    const p = getDb().processes.find((x) => x.id === "PRC-001")!;
    const stats = (c: number | null) => ({ ...computeStats([], TODAY), compliance: c });
    assert.equal(evaluateHealth({ ...p, followUpDate: null, nextReviewDate: null }, stats(95), TODAY).health, "healthy");
    assert.equal(evaluateHealth({ ...p, followUpDate: addDaysISO(TODAY, -3), nextReviewDate: null }, stats(95), TODAY).health, "at_risk");
    assert.equal(evaluateHealth({ ...p, followUpDate: null, nextReviewDate: null }, stats(p.complianceThreshold - 5), TODAY).health, "at_risk");
    assert.equal(evaluateHealth({ ...p, followUpDate: null, nextReviewDate: null }, stats(p.complianceThreshold - 15), TODAY).health, "critical");
    assert.equal(evaluateHealth({ ...p, status: "draft" }, stats(99), TODAY).health, "not_active");
    assert.equal(evaluateHealth(p, stats(null), TODAY).health, "no_data");
  });

  resetDb();
  await test("reset restores the pristine seed", () => {
    assert.equal(getDb().employees.length, 50);
    assert.ok(addDaysISO(TODAY, 0) === TODAY);
  });

  console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
}

main();
