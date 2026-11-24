/**
 * Pure checks for the process import pipeline (no browser).
 * Run: npx tsx scripts/process-import-check.ts
 */
import assert from "node:assert/strict";
import { buildSeedDatabase } from "@/lib/mock-data";
import { getDb, resetDb } from "@/lib/store/mock-db";
import { importProcesses, processImportHistory, type ProcessImportRow } from "@/lib/repositories/process-import";
import { todayISO } from "@/lib/utils/dates";
import type { RawWorkbook } from "@/lib/import/sheet-parser";
import { autoMap, PROCESS_FIELDS, STEP_FIELDS, type ProcessFieldKey } from "@/features/processes/import/fields";
import { buildProcessRecords, prepareImport, type ImportRecord } from "@/features/processes/import/parse";
import { defaultImportDefaults, summarize, validateRecords, type ImportDefaults, type ValidatedRecord } from "@/features/processes/import/validate";

const today = todayISO();
const db = buildSeedDatabase(today);
const baseDefaults: ImportDefaults = { ...defaultImportDefaults(db.settings, today), categoryId: "CAT-01", ownerId: "EMP-1007" };

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

const blank = () => Object.fromEntries(PROCESS_FIELDS.map((f) => [f.key, ""])) as Record<ProcessFieldKey, string>;
const rec = (rowNumber: number, v: Partial<Record<ProcessFieldKey, string>>, stepRows: ImportRecord["stepRows"] = []): ImportRecord => ({ rowNumber, values: { ...blank(), ...v }, stepRows });
const run = (records: ImportRecord[], over: Partial<ImportDefaults> = {}, matchById = false): ValidatedRecord[] =>
  validateRecords(records, { db, defaults: { ...baseDefaults, ...over }, today, matchById });

console.log("Header detection & mapping (any layout)");
const messy: RawWorkbook = {
  fileName: "register.xlsx",
  format: "xlsx",
  sheets: [
    {
      name: "Register 2026",
      matrix: [
        ["Altametrics — Process Register"],
        [""],
        ["Exported 2026-11-01"],
        ["Procedure Title", "Dept", "Type", "Owner Name", "How Often", "Go-Live", "Target %", "Mandatory?", ""],
        ["Vendor Onboarding", "Business Operations", "Finance & Governance", "Sanjay Mehta", "Fortnightly", "01/12/2026", "92", "Yes", "31/12/2026"],
        ["Laptop Refresh", "Administration & HR", "People & HR", "Kavita Joshi", "Yearly", "05/01/2027", "88%", "No", "31/03/2027"],
      ],
    },
  ],
};
const prepared = prepareImport(messy);
test("banner rows are skipped — header row found on line 4", () => {
  assert.equal(prepared.mainHeaderRow, 3);
  assert.equal(prepared.main.rows.length, 2);
  assert.equal(prepared.main.headers[8], "Column I");
});
const mapped = autoMap(PROCESS_FIELDS, prepared.main.headers, prepared.main.rows);
test("oddly named headers map to the right fields", () => {
  const h = prepared.main.headers;
  const col = (k: ProcessFieldKey) => (mapped.mapping[k] === null ? "—" : h[mapped.mapping[k]!]);
  assert.equal(col("name"), "Procedure Title");
  assert.equal(col("department"), "Dept");
  assert.equal(col("category"), "Type");
  assert.equal(col("owner"), "Owner Name");
  assert.equal(col("frequency"), "How Often");
  assert.equal(col("startDate"), "Go-Live");
  assert.equal(col("threshold"), "Target %");
  assert.equal(col("mandatory"), "Mandatory?");
});
test("an unlabeled date column is mapped by content (end date)", () => {
  assert.equal(mapped.mapping.endDate, 8);
  assert.equal(mapped.confidence.endDate, "content");
});
test("mapped rows validate: names → IDs, fuzzy frequencies, dd/mm/yyyy dates, percent thresholds", () => {
  const { records } = buildProcessRecords(prepared.main, mapped.mapping, null, null);
  const [a, b] = run(records, {}, false);
  assert.equal(a.state, "valid", JSON.stringify(a.errors));
  assert.equal(b.state, "valid", JSON.stringify(b.errors));
  assert.equal(a.input!.frequency, "custom");
  assert.equal(a.input!.customIntervalDays, 14);
  assert.equal(a.input!.effectiveDate, "2026-12-01");
  assert.equal(a.input!.expiryDate, "2026-12-31");
  assert.equal(a.input!.ownerId, "EMP-1043");
  assert.equal(a.input!.departmentId, "DEP-07");
  assert.equal(b.input!.frequency, "annually");
  assert.equal(b.input!.complianceThreshold, 88);
  assert.equal(b.input!.isMandatory, false);
});

console.log("Steps: inline and separate sheet");
test("inline steps column is parsed (pipes, numbering, flags)", () => {
  const [r] = run([rec(1, { name: "Inline Steps Process", steps: "1. Prepare | Gather inputs | 20 | N | N | Y\n2) Review | Peer check | 30 | Y | Y | Y\nPublish" })]);
  assert.equal(r.state, "valid", JSON.stringify(r.errors));
  assert.deepEqual(r.input!.steps.map((s) => s.name), ["Prepare", "Review", "Publish"]);
  assert.equal(r.input!.steps[1].evidenceRequired, true);
  assert.equal(r.input!.steps[1].approvalRequired, true);
  assert.equal(r.input!.steps[0].expectedMinutes, 20);
  assert.equal(r.input!.steps[2].expectedMinutes, 15);
});
test("semicolon-separated one-liner becomes steps", () => {
  const [r] = run([rec(1, { name: "One Liner", steps: "Plan; Execute; Review" })]);
  assert.equal(r.stepCount, 3);
});
const multi: RawWorkbook = {
  fileName: "multi.xlsx",
  format: "xlsx",
  sheets: [
    { name: "Instructions", matrix: [["How to use"], ["1. fill the sheet"]] },
    { name: "Reference", matrix: [["Categories", "Departments"], ["Engineering Excellence", "Engineering"]] },
    { name: "Steps", matrix: [["Process Name", "Step No", "Step Name", "Mandatory", "Expected Minutes", "Evidence Required"], ["onboarding checklist", "2", "Sign-off", "Yes", "10", "No"], ["Onboarding Checklist", "1", "Collect documents", "", "25", "Yes"], ["Ghost Process", "1", "Nothing", "", "5", ""]] },
    { name: "Processes", matrix: [["Process Name*", "Category*", "Process Owner*", "Frequency*", "Status"], ["Onboarding Checklist", "People & HR", "EMP-1047", "Monthly", "Active"]] },
  ],
};
const mp = prepareImport(multi);
test("multi-sheet workbook: process and steps sheets auto-detected, reference/instructions ignored", () => {
  assert.equal(multi.sheets[mp.processSheet].name, "Processes");
  assert.equal(mp.stepsSheet === null ? null : multi.sheets[mp.stepsSheet].name, "Steps");
});
test("steps sheet links to processes by name (case-insensitive), ordered by step no, orphans reported", () => {
  const m = autoMap(PROCESS_FIELDS, mp.main.headers, mp.main.rows);
  const sm = autoMap(STEP_FIELDS, mp.steps!.headers, mp.steps!.rows);
  const { records, orphanSteps } = buildProcessRecords(mp.main, m.mapping, mp.steps, sm.mapping);
  assert.deepEqual(records[0].stepRows.map((s) => s.values.name), ["Collect documents", "Sign-off"]);
  assert.equal(orphanSteps.length, 1);
  assert.equal(orphanSteps[0].values.processName, "Ghost Process");
  const [v] = run(records);
  assert.equal(v.state, "valid", JSON.stringify(v.errors));
  assert.equal(v.input!.status, "active");
  assert.equal(v.input!.steps[0].evidenceRequired, true);
  assert.equal(v.input!.steps[0].mandatory, true);
});
test("active process without steps is rejected; draft is allowed", () => {
  const [a] = run([rec(1, { name: "No Steps Active", status: "Active" })]);
  assert.equal(a.state, "invalid");
  assert.ok(a.errors.steps);
  const [d] = run([rec(1, { name: "No Steps Draft", status: "Draft" })]);
  assert.equal(d.state, "valid");
});

console.log("Applied-for scope inference");
test("no scope columns → department level on the owning department", () => {
  const [r] = run([rec(1, { name: "Scope A", department: "Engineering" })]);
  assert.equal(r.input!.scope.level, "department");
  assert.deepEqual(r.input!.scope.departmentIds, ["DEP-02"]);
});
test("org-wide process (no owning department) applies to every active department", () => {
  const [r] = run([rec(1, { name: "Scope Org" })]);
  assert.equal(r.input!.scope.departmentIds.length, 17);
});
test("teams given → team level, departments derived from the teams", () => {
  const [r] = run([rec(1, { name: "Scope B", appliedTeams: "Platform Engineering; QA Automation" })]);
  assert.equal(r.state, "valid", JSON.stringify(r.errors));
  assert.equal(r.input!.scope.level, "team");
  assert.deepEqual([...r.input!.scope.departmentIds].sort(), ["DEP-02", "DEP-03"]);
  assert.deepEqual([...r.input!.scope.teamIds].sort(), ["TEAM-02", "TEAM-04"]);
});
test("employees given by ID, e-mail and name → employee level", () => {
  const [r] = run([rec(1, { name: "Scope C", appliedEmployees: "EMP-1009, neha.agarwal@altametrics.example; Karan Bhatia" })]);
  assert.equal(r.state, "valid", JSON.stringify(r.errors));
  assert.equal(r.input!.scope.level, "employee");
  assert.deepEqual([...r.input!.scope.employeeIds].sort(), ["EMP-1007", "EMP-1008", "EMP-1009"]);
});
test("a team outside the chosen departments is rejected", () => {
  const [r] = run([rec(1, { name: "Scope D", appliedDepartments: "Engineering", appliedTeams: "Customer Success Desk" })]);
  assert.equal(r.state, "invalid");
  assert.match(r.errors.appliedTeams ?? "", /does not belong/);
});
test("explicit level wins and a team-level row without teams is an error", () => {
  const [r] = run([rec(1, { name: "Scope E", appliedAt: "Team", appliedDepartments: "Engineering" })]);
  assert.equal(r.state, "invalid");
  assert.ok(r.errors.appliedTeams);
});

console.log("Defaults, duplicates, matching");
test("blank cells take the chosen defaults and are reported", () => {
  const [r] = run([rec(1, { name: "Defaults Only" })], { frequency: "monthly", priority: "high", threshold: 93, status: "draft" });
  assert.equal(r.state, "valid", JSON.stringify(r.errors));
  assert.equal(r.input!.categoryId, "CAT-01");
  assert.equal(r.input!.ownerId, "EMP-1007");
  assert.equal(r.input!.frequency, "monthly");
  assert.equal(r.input!.priority, "high");
  assert.equal(r.input!.complianceThreshold, 93);
  assert.equal(r.input!.effectiveDate, today);
  assert.ok(r.defaultsApplied.includes("category") && r.defaultsApplied.includes("owner") && r.defaultsApplied.includes("frequency"));
});
test("missing default category / owner is an error when nothing supplies them", () => {
  const [r] = run([rec(1, { name: "Needs Defaults" })], { categoryId: "", ownerId: "" });
  assert.equal(r.state, "invalid");
  assert.ok(r.errors.category && r.errors.owner);
});
test("duplicate names inside the file are flagged on the second occurrence", () => {
  const out = run([rec(1, { name: "Twin Process" }), rec(2, { name: "twin  process" })]);
  assert.equal(out[0].state, "valid");
  assert.equal(out[1].state, "duplicate");
  assert.match(out[1].errors.name ?? "", /row 1/);
  assert.equal(summarize(out).duplicate, 1);
});
test("existing process name → update candidate with a patch of only the provided fields", () => {
  const [r] = run([rec(1, { name: "Daily Stand-up & Status Update", priority: "High", tags: "ops, daily" })]);
  assert.equal(r.state, "update");
  assert.equal(r.existing!.id, "PRC-001");
  assert.deepEqual(Object.keys(r.patch!).sort(), ["name", "priority", "tags"]);
  assert.equal(r.patch!.priority, "high");
});
test("Process ID column: ignored by default, used as a match key when enabled", () => {
  const off = run([rec(1, { id: "PRC-002", name: "Brand New Name" })], {}, false)[0];
  assert.equal(off.state, "valid");
  assert.equal(off.existing, null);
  const on = run([rec(1, { id: "PRC-002", name: "Renamed Code Review" })], {}, true)[0];
  assert.equal(on.state, "update");
  assert.equal(on.existing!.id, "PRC-002");
  assert.equal(on.patch!.name, "Renamed Code Review");
  const missing = run([rec(1, { id: "PRC-999", name: "Daily Stand-up & Status Update" })], {}, true)[0];
  assert.equal(missing.existing!.id, "PRC-001");
  assert.ok(missing.infos.some((i) => /not found/.test(i)));
});
test("renaming onto another existing process name is rejected", () => {
  const [r] = run([rec(1, { id: "PRC-002", name: "Daily Stand-up & Status Update" })], {}, true);
  assert.equal(r.state, "invalid");
  assert.match(r.errors.name ?? "", /already exists/);
});

console.log("Fuzzy suggestions & people");
test("misspelled category gets a 'did you mean' suggestion", () => {
  const [r] = run([rec(1, { name: "Typo Category", category: "Engineering Excelence" })]);
  assert.equal(r.state, "invalid");
  assert.equal(r.suggestions.category?.[0].label, "Engineering Excellence");
});
test("abbreviated / misspelled department and team get suggestions", () => {
  const [r] = run([rec(1, { name: "Typo Dept", department: "Enginering" })]);
  assert.equal(r.suggestions.department?.[0].label, "Engineering");
  const [t] = run([rec(1, { name: "Typo Team", appliedDepartments: "Engineering", appliedTeams: "Platfrom Engineering" })]);
  assert.equal(t.suggestions.appliedTeams?.[0].label, "Platform Engineering");
});
test("unknown frequency/priority/status/yes-no produce suggestions or clear errors", () => {
  const [r] = run([rec(1, { name: "Bad Enums", frequency: "Weakly", priority: "Hihg", status: "Actve", mandatory: "maybe" })]);
  assert.equal(r.suggestions.frequency?.[0].label, "Weekly");
  assert.equal(r.suggestions.priority?.[0].label, "High");
  assert.equal(r.suggestions.status?.[0].label, "Active");
  assert.ok(r.errors.mandatory);
});
test("people: unknown name suggests the closest employee; ambiguous names are flagged; inactive rejected", () => {
  const [r] = run([rec(1, { name: "People Test", owner: "Karan Bhatai" })]);
  assert.equal(r.suggestions.owner?.[0].value, "EMP-1007");
  const [i] = run([rec(1, { name: "Inactive Owner", owner: "EMP-1050" })]);
  assert.match(i.errors.owner ?? "", /inactive/);
});
test("date formats: 20-Nov-2026, 2026/11/20, 20.11.2026 and Excel serials; end before start is rejected", () => {
  const [r] = run([rec(1, { name: "Dates", startDate: "20-Nov-2026", endDate: "2027/11/20", meetingDate: "20.11.2026", nextReviewDate: "46345" })]);
  assert.equal(r.input!.effectiveDate, "2026-11-20");
  assert.equal(r.input!.expiryDate, "2027-11-20");
  assert.equal(r.input!.meetingDate, "2026-11-20");
  assert.ok(r.input!.nextReviewDate && r.input!.nextReviewDate > "2026-01-01");
  const [bad] = run([rec(1, { name: "Bad Dates", startDate: "2026-12-01", endDate: "2026-11-01" })]);
  assert.ok(bad.errors.endDate);
});
test("custom frequency requires an interval; 'every 10 days' is understood", () => {
  const [a] = run([rec(1, { name: "Custom A", frequency: "Custom" })]);
  assert.ok(a.errors.customInterval);
  const [b] = run([rec(1, { name: "Custom B", frequency: "every 10 days" })]);
  assert.equal(b.input!.customIntervalDays, 10);
});

async function repositoryChecks() {
  console.log("Repository import");
  resetDb();
  const live = () => getDb();
  const rows = (validated: ValidatedRecord[]): ProcessImportRow[] =>
    validated
      .filter((r) => r.state === "valid" || r.state === "update")
      .map((r) => (r.state === "valid" ? { rowNumber: r.rowNumber, action: "create" as const, input: r.input! } : { rowNumber: r.rowNumber, action: "update" as const, existingId: r.existing!.id, patch: r.patch! }));
  const validated = validateRecords(
    [
      rec(1, { name: "Import Alpha", status: "Active", appliedDepartments: "Customer Support", steps: "Triage | Check queue | 10 | N | N | Y\nReply | Answer customers | 20 | N | N | Y" }),
      rec(2, { name: "Import Beta" }),
      rec(3, { name: "Daily Stand-up & Status Update", priority: "Critical" }),
      rec(4, { name: "Broken", category: "Nope Nope Nope" }),
    ],
    { db: live(), defaults: { ...baseDefaults }, today, matchById: false },
  );
  const before = live().processes.length;
  const beforeAssignments = live().assignments.length;
  const prc1 = { ...live().processes.find((p) => p.id === "PRC-001")! };
  const seedPrc5 = JSON.stringify(live().processes.find((p) => p.id === "PRC-005"));
  const summary = await importProcesses(rows(validated), { fileName: "check.xlsx", skipped: 0, failed: summarize(validated).invalid });
  test("new processes get auto-generated sequential IDs and existing ones are updated in place", () => {
    assert.deepEqual(summary.createdIds, ["PRC-016", "PRC-017"]);
    assert.deepEqual(summary.updatedIds, ["PRC-001"]);
    assert.equal(live().processes.length, before + 2);
    assert.equal(summary.total, 4);
    assert.equal(summary.failed, 1);
  });
  test("update touches only the provided fields and bumps the version with an import summary", () => {
    const p = live().processes.find((x) => x.id === "PRC-001")!;
    assert.equal(p.priority, "critical");
    assert.equal(p.ownerId, prc1.ownerId);
    assert.equal(p.steps.length, prc1.steps.length);
    assert.equal(p.version, prc1.version + 1);
    assert.equal(p.versionHistory.at(-1)!.summary, "Updated via Excel import");
    assert.ok(p.versionHistory.at(-1)!.changes?.some((c) => c.field === "priority"));
  });
  test("an Active import with a scope creates assignments; a Draft import does not", () => {
    const created = live().assignments.filter((a) => a.processId === "PRC-016");
    assert.equal(created.length, 1);
    assert.equal(created[0].level, "department");
    assert.equal(created[0].source, "process_scope");
    assert.ok(live().assignments.length > beforeAssignments);
    assert.equal(live().assignments.filter((a) => a.processId === "PRC-017").length, 0);
    assert.equal(live().processes.find((p) => p.id === "PRC-017")!.status, "draft");
  });
  test("the run is audited and shows up in the import history", () => {
    const h = processImportHistory(live().auditLogs);
    assert.equal(h.length, 1);
    assert.equal(h[0].id, "PIMP-0001");
    assert.equal(h[0].fileName, "check.xlsx");
    assert.deepEqual({ c: h[0].created, u: h[0].updated, f: h[0].failed, t: h[0].total }, { c: 2, u: 1, f: 1, t: 4 });
    assert.deepEqual(h[0].createdIds, ["PRC-016", "PRC-017"]);
  });
  test("processes missing from the file are untouched and nothing is deleted", () => {
    assert.equal(JSON.stringify(live().processes.find((p) => p.id === "PRC-005")), seedPrc5);
  });
  resetDb();
}

repositoryChecks().then(() => console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`));
