/**
 * Pure-logic checks for the flexible employee import (no browser).
 * Run: npx tsx scripts/employee-import-check.ts
 */
import assert from "node:assert/strict";
import { buildSeedDatabase } from "@/lib/mock-data";
import { todayISO } from "@/lib/utils/dates";
import { detectHeaderRow, inferColumnKind, parseDelimited, parseFlexibleDate, splitFullName, tableFromMatrix } from "@/lib/import/sheet-parser";
import { autoMapHeaders, HEADER_VOCABULARY, missingMinimum } from "@/features/employees/import/fields";
import { analyzeRecords, buildRecords, DEFAULT_OPTIONS, NO_IDENTITY_WARNING, normalizeStatus, validateRecords, type ImportOptions } from "@/features/employees/import/validate";
import { canonicalBandKey, closestMaster, deriveDepartmentCode } from "@/features/employees/import/master-reconcile";
import type { Database } from "@/types";

const today = todayISO();
// These checks exercise band-level derivation, so pin the band master to the original B1–B5 set (the seed also has L3–L15).
const seed = buildSeedDatabase(today);
const db = { ...seed, bands: seed.bands.filter((b) => /^B[1-5]$/.test(b.code)) };
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

const run = (matrix: string[][], options: ImportOptions = DEFAULT_OPTIONS) => {
  const h = detectHeaderRow(matrix, HEADER_VOCABULARY);
  const t = tableFromMatrix(matrix, h);
  const { mapping } = autoMapHeaders(t.headers, t.rows);
  return { t, mapping, out: validateRecords(buildRecords(t.rows, mapping), db, today, options) };
};

console.log("Reading messy files");
test("banner rows above the header are skipped", () => {
  const m = [["Altametrics HR export"], ["Generated 20-Nov-2026"], [], ["Employee Name", "Work Email", "Dept", "Joined On"], ["Priya Menon", "priya.menon@x.com", "Engineering", "03-Mar-2024"]];
  assert.equal(detectHeaderRow(m.filter((r) => r.length), HEADER_VOCABULARY), 2);
  const { t } = run(m.filter((r) => r.length));
  assert.deepEqual(t.headers, ["Employee Name", "Work Email", "Dept", "Joined On"]);
  assert.equal(t.rows.length, 1);
});
test("TSV and semicolon CSV are parsed (delimiter auto-detected)", () => {
  assert.deepEqual(parseDelimited("Name\tEmail\nA B\ta@b.co"), [["Name", "Email"], ["A B", "a@b.co"]]);
  assert.deepEqual(parseDelimited('Name;Email\n"Doe; John";j@d.co'), [["Name", "Email"], ["Doe; John", "j@d.co"]]);
});
test("blank/duplicate headers are repaired", () => {
  const t = tableFromMatrix([["Name", "", "Name"], ["a", "b", "c"]], 0);
  assert.deepEqual(t.headers, ["Name", "Column B", "Name (2)"]);
});

console.log("Mapping");
test("aliases + fuzzy + content inference map unusual headers", () => {
  const headers = ["Emp No", "Full Name", "Official EMAIL", "Mob", "Colx"];
  const rows = [["1099", "A B", "a@b.co", "9812345678", "20/11/2023"], ["1098", "C D", "c@d.co", "9812345679", "01/02/2022"]];
  const { mapping, confidence } = autoMapHeaders(headers, rows);
  assert.equal(mapping.id, 0);
  assert.equal(mapping.fullName, 1);
  assert.equal(mapping.email, 2);
  assert.equal(mapping.dateOfJoining, 4, "date column inferred from content");
  assert.equal(confidence.dateOfJoining, "guessed");
  assert.equal(confidence.email, "exact");
});
test("minimum = a name (Employee ID and Email are both optional)", () => {
  assert.equal(missingMinimum(autoMapHeaders(["Name", "Email"]).mapping).length, 0);
  assert.equal(missingMinimum(autoMapHeaders(["Name", "Department"]).mapping).length, 0, "a name alone is enough");
  assert.equal(missingMinimum(autoMapHeaders(["Department", "Band"]).mapping).length, 1, "without a name column it is still blocked");
});
test("content kinds", () => {
  assert.equal(inferColumnKind(["a@b.co", "c@d.co"]), "email");
  assert.equal(inferColumnKind(["EMP-1001", "EMP-1002"]), "id");
  assert.equal(inferColumnKind(["2011-256", "2011-257"]), "id");
  assert.equal(inferColumnKind(["20-Nov-2026", "2026-01-02"]), "date");
});

console.log("Values");
test("full-name split", () => {
  assert.deepEqual(splitFullName("Priya Nair"), { first: "Priya", last: "Nair" });
  assert.deepEqual(splitFullName("Nair, Priya"), { first: "Priya", last: "Nair" });
  assert.deepEqual(splitFullName("Mary Ann Smith"), { first: "Mary Ann", last: "Smith" });
});
test("flexible dates incl. Excel serials and day-first ambiguity", () => {
  assert.equal(parseFlexibleDate("20-Nov-2026"), "2026-11-20");
  assert.equal(parseFlexibleDate("20/11/2026"), "2026-11-20");
  assert.equal(parseFlexibleDate("Nov 20, 2026"), "2026-11-20");
  assert.equal(parseFlexibleDate("01/02/2026"), "2026-02-01");
  assert.equal(parseFlexibleDate("01/02/2026", { dayFirst: false }), "2026-01-02");
  assert.equal(parseFlexibleDate("45250"), "2023-11-20");
  assert.equal(parseFlexibleDate("not a date"), null);
});
test("status synonyms", () => {
  assert.equal(normalizeStatus("Resigned"), "inactive");
  assert.equal(normalizeStatus("Left"), "inactive");
  assert.equal(normalizeStatus("On Leave"), "on_leave");
  assert.equal(normalizeStatus(""), "active");
  assert.equal(normalizeStatus("???"), null);
});

console.log("Validation");
const opts: ImportOptions = {
  ...DEFAULT_OPTIONS,
  defaults: { status: "Active", band: "B1", dateOfJoining: today },
};

test("name + email only: defaults fill the rest, ID is generated, defaulted cells are tagged", () => {
  const { out } = run([["Name", "Email", "Department"], ["Sunil Rao", "sunil.rao@x.com", "Engineering"], ["Tina Das", "tina.das@x.com", "Engineering"]], opts);
  assert.equal(out[0].state, "valid", JSON.stringify(out[0].errors));
  assert.equal(out[0].resolved?.firstName, "Sunil");
  assert.equal(out[0].resolved?.lastName, "Rao");
  assert.equal(out[0].sources.band, "default");
  assert.equal(out[0].sources.dateOfJoining, "default");
  assert.equal(out[0].sources.firstName, "split");
  assert.equal(out[0].idSource, "generated");
  assert.equal(out[0].effectiveId, "EMP-1051");
  assert.equal(out[1].effectiveId, "EMP-1052", "generated IDs increment across the file");
});
test("without defaults the missing required values are flagged", () => {
  const { out } = run([["Name", "Email", "Department"], ["Sunil Rao", "sunil.rao@x.com", "Engineering"]]);
  assert.equal(out[0].state, "invalid");
  assert.ok(out[0].errors.band);
});
test("generated IDs avoid collisions with IDs present in the file", () => {
  const { out } = run([["Employee ID", "Name", "Email", "Department"], ["EMP-1051", "A One", "a1@x.com", "Engineering"], ["", "B Two", "b2@x.com", "Engineering"]], opts);
  assert.equal(out[0].effectiveId, "EMP-1051");
  assert.equal(out[1].effectiveId, "EMP-1052");
});
test("blank ID + email of an existing employee → update candidate (never silent)", () => {
  const amit = db.employees.find((e) => e.id === "EMP-1009")!;
  const { out } = run([["Name", "Email", "Department", "Mobile"], ["Amit K Kumar", amit.email, "Engineering", "9000000001"]], opts);
  assert.equal(out[0].state, "update");
  assert.equal(out[0].effectiveId, "EMP-1009");
  assert.equal(out[0].idSource, "email-match");
  assert.equal(out[0].resolved?.id, "EMP-1009");
  // blank cells on an update keep the EXISTING values, not the defaults
  assert.equal(out[0].resolved?.bandId, amit.bandId);
  assert.equal(out[0].sources.band, "existing");
});
test("Employee IDs are free-form strings, kept as typed (upper-cased); duplicates flagged case-insensitively", () => {
  const { out } = run([["Emp ID", "Name", "Email", "Department"], ["2011-256", "A One", "a1@x.com", "Engineering"], ["2011-256", "B Two", "b2@x.com", "Engineering"], ["ab-7", "C Three", "c3@x.com", "Engineering"], ["bad id!", "D Four", "d4@x.com", "Engineering"]], opts);
  assert.equal(out[0].effectiveId, "2011-256");
  assert.equal(out[1].state, "duplicate");
  assert.equal(out[2].effectiveId, "AB-7");
  assert.equal(out[3].state, "invalid");
  assert.ok(out[3].errors.id?.includes("letters, numbers"));
});
test("generated IDs ignore free-form IDs and continue the EMP-#### sequence", () => {
  const { out } = run([["Employee ID", "Name", "Email", "Department"], ["2011-256", "A One", "a1@x.com", "Engineering"], ["", "B Two", "b2@x.com", "Engineering"]], opts);
  assert.equal(out[0].effectiveId, "2011-256");
  assert.match(out[1].effectiveId, /^EMP-\d+$/);
});
test("fuzzy master-data suggestions (Department / Band switches OFF = old strict behaviour)", () => {
  const strict: ImportOptions = { ...opts, createMaster: { department: false, band: false } };
  const { out } = run([["Name", "Email", "Department", "Team"], ["Sunil Rao", "s@x.com", "Enginering", "Platfrm Engineering"]], strict);
  assert.equal(out[0].state, "invalid");
  assert.ok(out[0].suggestions.department?.includes("Engineering"), JSON.stringify(out[0].suggestions));
  assert.ok(out[0].errors.department?.includes("did you mean Engineering"));
  assert.ok(out[0].suggestions.team?.includes("Platform Engineering"));
});
test("dates in several formats, day-first toggle", () => {
  const rows = [["Name", "Email", "Department", "DOJ"], ["A One", "a1@x.com", "Engineering", "05/06/2024"]];
  assert.equal(run(rows, opts).out[0].resolved?.dateOfJoining, "2024-06-05");
  assert.equal(run(rows, { ...opts, dayFirst: false }).out[0].resolved?.dateOfJoining, "2024-05-06");
});
test("email is optional — a blank email stays blank (nothing is generated)", () => {
  const g = run([["Name", "Department"], ["Sunil Rao", "Engineering"]], opts).out[0];
  assert.equal(g.state, "valid", JSON.stringify(g.errors));
  assert.equal(g.resolved?.email, "");
  assert.equal(g.errors.email, undefined);
  assert.equal(g.sources.email, undefined);
});
test("reporting manager by ID, email and full name", () => {
  const karan = db.employees.find((e) => e.id === "EMP-1007")!;
  const m = [["Name", "Email", "Department", "Manager"], ["A One", "a1@x.com", "Engineering", "Karan Bhatia"], ["B Two", "b2@x.com", "Engineering", karan.email], ["C Three", "c3@x.com", "Engineering", "emp-1007"], ["D Four", "d4@x.com", "Engineering", "Nobody Here"]];
  const { out } = run(m, opts);
  assert.equal(out[0].resolved?.reportingManagerId, "EMP-1007");
  assert.equal(out[1].resolved?.reportingManagerId, "EMP-1007");
  assert.equal(out[2].resolved?.reportingManagerId, "EMP-1007");
  assert.ok(out[3].errors.reportingManagerId);
});
test("lenient phone formats", () => {
  const { out } = run([["Name", "Email", "Department", "Phone"], ["A One", "a1@x.com", "Engineering", "(+91) 98123-45678"], ["B Two", "b2@x.com", "Engineering", "abc"]], opts);
  assert.equal(out[0].resolved?.phone, "+919812345678");
  assert.ok(out[1].errors.phone);
});


console.log("Email is optional");
const runDb = (dbx: Pick<Database, "employees" | "departments" | "teams" | "bands">, matrix: string[][], options: ImportOptions) => {
  const t = tableFromMatrix(matrix, detectHeaderRow(matrix, HEADER_VOCABULARY));
  const { mapping } = autoMapHeaders(t.headers, t.rows);
  return analyzeRecords(buildRecords(t.rows, mapping), dbx, today, options);
};
test("rows without any email column are valid; two blank emails never collide", () => {
  const { out } = run([["Name", "Department"], ["Sunil Rao", "Engineering"], ["Tina Das", "Engineering"]], opts);
  assert.equal(out[0].state, "valid");
  assert.equal(out[1].state, "valid");
  assert.equal(out[0].resolved?.email, "");
  assert.equal(out[1].resolved?.email, "");
  assert.notEqual(out[0].effectiveId, out[1].effectiveId);
});
test("no ID and no email → soft warning (not an error); with an email there is no warning", () => {
  const { out } = run([["Name", "Email", "Department"], ["Sunil Rao", "", "Engineering"], ["Tina Das", "tina.das@x.com", "Engineering"]], opts);
  assert.equal(out[0].state, "valid");
  assert.deepEqual(out[0].warnings, [NO_IDENTITY_WARNING]);
  assert.deepEqual(out[1].warnings, []);
});
test("an explicit Employee ID without an email has no identity warning", () => {
  const { out } = run([["Employee ID", "Name", "Department"], ["EMP-3001", "Sunil Rao", "Engineering"]], opts);
  assert.equal(out[0].state, "valid");
  assert.deepEqual(out[0].warnings, []);
});
test("an invalid email is still rejected when provided", () => {
  const { out } = run([["Name", "Email", "Department"], ["Sunil Rao", "not-an-email", "Engineering"]], opts);
  assert.ok(out[0].errors.email);
});
test("blank-email employees in the system are never matched by a blank email", () => {
  const withBlank = { ...db, employees: db.employees.map((e) => (e.id === "EMP-1010" ? { ...e, email: "" } : e)) };
  const a = runDb(withBlank, [["Name", "Department"], ["Sunil Rao", "Engineering"]], opts);
  assert.equal(a.rows[0].state, "valid");
  assert.equal(a.rows[0].existing, null);
});

console.log("Master data: Department / Band read from the file");
const masterBase: ImportOptions = { ...DEFAULT_OPTIONS, defaults: { status: "Active", dateOfJoining: today } };
const file = (rows: string[][]) => [["Name", "Department", "Band"], ...rows];

test("unknown Department / Band default to 'create' and the rows are valid", () => {
  const a = runDb(db, file([["Asha Verma", "Data Science", "B6"]]), masterBase);
  const r = a.rows[0];
  assert.equal(r.state, "valid", JSON.stringify(r.errors));
  assert.equal(r.resolved?.departmentId, "__new:department:data science");
  assert.equal(r.resolved?.bandId, "__new:band:B6");
  assert.deepEqual(a.unknown.map((u) => [u.field, u.value, u.decision.action]), [["department", "Data Science", "create"], ["band", "B6", "create"]]);
  assert.equal(a.masterPlan.total, 2);
  assert.deepEqual(a.masterPlan.departments.map((d) => [d.name, d.code, d.rows]), [["Data Science", "DS", 1]]);
  const band = a.masterPlan.bands[0];
  assert.deepEqual([band.code, band.level, band.name], ["B6", 6, "Band 6"]);
  assert.equal(r.sources.department, "new");
  assert.equal(r.master.department?.kind, "create");
  assert.deepEqual(new Set(r.masterRefs), new Set(["__new:department:data science", "__new:band:B6"]));
});
test("typos and abbreviations map to the existing record instead of creating junk", () => {
  const a = runDb(db, file([["Asha Verma", "Engg", "B2"], ["Ravi Nair", "Enginering", "Band 3"]]), masterBase);
  assert.equal(a.rows[0].state, "valid", JSON.stringify(a.rows[0].errors));
  assert.equal(a.rows[0].resolved?.departmentId, "DEP-02");
  assert.equal(a.rows[0].sources.department, "mapped");
  assert.equal(a.rows[0].effective.department, "Engineering");
  assert.equal(a.rows[0].master.department?.kind, "map");
  assert.equal(a.rows[1].resolved?.departmentId, "DEP-02");
  assert.equal(a.rows[1].resolved?.bandId, "BAND-3", "'Band 3' is band code B3");
  assert.equal(a.masterPlan.total, 0, "nothing is created for typos");
  const suggestion = a.unknown.find((u) => u.value === "Engg")!.suggestion;
  assert.ok(suggestion && suggestion.label === "Engineering" && suggestion.score >= 0.8);
});
test("band code derivation: B<n> / Band <n> / <n> / free text; levels never collide", () => {
  assert.equal(canonicalBandKey("b 6"), "B6");
  assert.equal(canonicalBandKey("Band 07"), "B7");
  assert.equal(canonicalBandKey("6"), "B6");
  assert.equal(canonicalBandKey("Senior"), null);
  const a = runDb(db, file([["A One", "Engineering", "Band 7"], ["B Two", "Engineering", "Principal"], ["C Three", "Engineering", "Fellow"], ["D Four", "Engineering", "7"]]), masterBase);
  const bands = a.masterPlan.bands.map((b) => [b.name, b.code, b.level]);
  assert.deepEqual(bands, [["Band 7", "B7", 7], ["Principal", "B8", 8], ["Fellow", "B9", 9]]);
  assert.equal(a.rows[0].resolved?.bandId, a.rows[3].resolved?.bandId, "'Band 7' and '7' are the same band");
  assert.equal(a.masterPlan.bands[0].rows, 2);
});
test("a band whose level is taken gets the next free level but keeps its code", () => {
  const withB6 = { ...db, bands: [...db.bands, { id: "BAND-X", code: "B9", name: "Band 6", level: 6, description: "", status: "active" as const }] };
  const a = runDb(withB6, file([["A One", "Engineering", "B6"]]), masterBase);
  // "B6" is not an existing code, but its generated name "Band 6" exists → the repository reuses it at commit; the plan itself uses the next free level.
  assert.equal(a.masterPlan.bands[0].code, "B6");
  assert.equal(a.masterPlan.bands[0].level, 7, "level 6 is taken, so the next free level is used");
});
test("department codes are derived from initials and stay unique", () => {
  assert.equal(deriveDepartmentCode("Data Science", new Set()), "DS");
  assert.equal(deriveDepartmentCode("Marketing", new Set()), "MAR");
  assert.equal(deriveDepartmentCode("Research & Development", new Set()), "RD");
  const taken = new Set(["DS"]);
  assert.equal(deriveDepartmentCode("Digital Sales", taken), "DS2");
  const a = runDb(db, file([["A One", "Product Marketing", "B1"], ["B Two", "Digital Sales", "B1"], ["C Three", "Data Science", "B1"], ["D Four", "Dynamic Strategy", "B1"]]), masterBase);
  const codes = a.masterPlan.departments.map((d) => d.code);
  assert.deepEqual(codes, ["PM2", "DS", "DS2", "DS3"], "PM is taken by Product Management; the three D+S departments get DS, DS2, DS3");
  assert.equal(new Set(codes).size, codes.length, "all planned codes are unique");
});
test("switch OFF → every unknown value is unresolved (rows invalid, with suggestions)", () => {
  const off: ImportOptions = { ...masterBase, createMaster: { department: false, band: false } };
  const a = runDb(db, file([["A One", "Data Science", "B6"], ["B Two", "Engg", "B2"]]), off);
  assert.equal(a.rows[0].state, "invalid");
  assert.ok(a.rows[0].errors.department && a.rows[0].errors.band);
  assert.equal(a.rows[1].state, "invalid", "typos are unresolved too when the switch is off");
  assert.ok(a.rows[1].errors.department?.includes("did you mean Engineering"), a.rows[1].errors.department);
  assert.equal(a.masterPlan.total, 0);
  assert.ok(a.unknown.every((u) => u.decision.action === "skip"));
});
test("a single switch only affects its own field", () => {
  const a = runDb(db, file([["A One", "Data Science", "B6"]]), { ...masterBase, createMaster: { department: true, band: false } });
  assert.equal(a.rows[0].state, "invalid");
  assert.ok(a.rows[0].errors.band && !a.rows[0].errors.department);
});
test("explicit user decisions override the defaults (map a new value, create instead of map, skip)", () => {
  const rows = file([["A One", "Engg", "B1"]]);
  const created = runDb(db, rows, { ...masterBase, masterDecisions: { department: { engg: { action: "create" } } } });
  assert.equal(created.rows[0].resolved?.departmentId, "__new:department:engg");
  const other = file([["A One", "Platform Dept", "B1"]]);
  const mapped = runDb(db, other, { ...masterBase, masterDecisions: { department: { "platform dept": { action: "map", targetId: "DEP-02" } } } });
  assert.equal(mapped.rows[0].resolved?.departmentId, "DEP-02");
  assert.equal(mapped.masterPlan.departments.length, 0);
  const skipped = runDb(db, other, { ...masterBase, masterDecisions: { department: { "platform dept": { action: "skip" } } } });
  assert.equal(skipped.rows[0].state, "invalid");
  // an explicit 'create' is ignored when that field's switch is off
  const blocked = runDb(db, rows, { ...masterBase, createMaster: { department: false, band: true }, masterDecisions: { department: { engg: { action: "create" } } } });
  assert.equal(blocked.rows[0].state, "invalid");
});
test("a team under a NEW department is an error with a clear message", () => {
  const a = runDb(db, [["Name", "Department", "Team", "Band"], ["A One", "Data Science", "Platform Engineering", "B1"]], masterBase);
  assert.equal(a.rows[0].state, "invalid");
  assert.equal(a.rows[0].errors.team, 'Team "Platform Engineering" not found — new departments have no teams yet');
});
test("inactive existing Department / Band are errors, never silently reused", () => {
  const inactive = {
    ...db,
    departments: db.departments.map((d) => (d.id === "DEP-03" ? { ...d, status: "inactive" as const } : d)),
    bands: db.bands.map((b) => (b.code === "B2" ? { ...b, status: "inactive" as const } : b)),
  };
  const a = runDb(inactive, file([["A One", "Quality Assurance", "B2"]]), masterBase);
  assert.equal(a.rows[0].state, "invalid");
  assert.equal(a.rows[0].errors.department, 'Department "Quality Assurance" is inactive');
  assert.equal(a.rows[0].errors.band, 'Band "B2" is inactive');
});
test("only rows that can be imported contribute to the plan (invalid rows do not create master data)", () => {
  const a = runDb(db, [["Name", "Department", "Band", "DOJ"], ["A One", "Data Science", "B1", "not a date"], ["B Two", "Growth Marketing", "B1", "2024-01-05"]], masterBase);
  assert.equal(a.rows[0].state, "invalid");
  assert.equal(a.rows[1].state, "valid");
  assert.ok(a.unknown.some((u) => u.value === "Data Science"), "still listed for the user to resolve");
  assert.deepEqual(a.masterPlan.departments.map((d) => d.name), ["Growth Marketing"]);
});
test("spelling variants of one new value are merged; counts are per row", () => {
  const a = runDb(db, file([["A One", "data science", "B1"], ["B Two", "Data Science", "B1"], ["C Three", "DATA  SCIENCE", "B1"]]), masterBase);
  assert.equal(a.unknown.filter((u) => u.field === "department").length, 1);
  assert.equal(a.unknown.find((u) => u.field === "department")!.rows, 3);
  assert.equal(a.masterPlan.departments.length, 1);
  assert.equal(a.masterPlan.departments[0].name, "Data Science", "an all-lowercase spelling is tidied to Title Case");
  assert.equal(a.masterPlan.departments[0].rows, 3);
});
test("defaults and existing records never produce unknown values", () => {
  const amit = db.employees.find((e) => e.id === "EMP-1009")!;
  const a = runDb(db, [["Name", "Email"], ["Amit K", amit.email]], { ...masterBase, defaults: { ...masterBase.defaults, department: "Engineering", band: "B1" } });
  assert.equal(a.unknown.length, 0);
});
test("closestMaster ranks abbreviations and typos", () => {
  assert.equal(closestMaster("department", "Engg", db, 1, 0.8)[0].label, "Engineering");
  assert.equal(closestMaster("department", "Customer Suport", db, 1, 0.8)[0].label, "Customer Support");
  assert.equal(closestMaster("band", "Zzzz Qqqq", db, 1, 0.6).length, 0);
});

async function fileChecks() {
  console.log("Real .xlsx / .tsv files through the loader");
  const ExcelJS = (await import("exceljs")).default;
  const { initialSelection, loadWorkbook, tableFor } = await import("@/features/employees/import/parse");
  const wb = new ExcelJS.Workbook();
  const notes = wb.addWorksheet("Read me");
  notes.addRow(["Quarterly HR export — do not edit"]);
  const data = wb.addWorksheet("Staff list");
  data.addRow(["Altametrics Pvt Ltd — Joiners Q4"]);
  data.addRow([]);
  data.addRow(["Staff Name", "Official Email", "Dept", "Date Joined", "Mobile"]);
  data.addRow(["Rhea Kapoor", "rhea.kapoor@x.com", "Engineering", new Date(Date.UTC(2024, 2, 4)), 9812345678]);
  data.addRow(["Zane Ali", "zane.ali@x.com", "Quality Assurance", new Date(Date.UTC(2023, 10, 20)), 9812345679]);
  const buf = await wb.xlsx.writeBuffer();
  const loaded = await loadWorkbook(new File([buf], "joiners.xlsx"));
  const sel = initialSelection(loaded);
  const table = tableFor(loaded, sel.sheetIndex, sel.headerRow);
  const { mapping } = autoMapHeaders(table.headers, table.rows);
  const out = validateRecords(buildRecords(table.rows, mapping), db, today, {
    ...DEFAULT_OPTIONS,
    defaults: { status: "Active", band: "B1", dateOfJoining: today },
  });
  test("multi-sheet xlsx: best sheet + header row auto-detected", () => {
    assert.equal(loaded.sheets.length, 2);
    assert.equal(table.sheetName, "Staff list");
    assert.equal(sel.headerRow, 1, "banner row skipped (empty rows are dropped by the reader)");
    assert.equal(table.rows.length, 2);
  });
  test("xlsx dates/numbers read correctly and rows validate", () => {
    assert.equal(table.rows[0][3], "2024-03-04");
    assert.equal(table.rows[0][4], "9812345678");
    assert.equal(out[0].state, "valid", JSON.stringify(out[0].errors));
    assert.equal(out[0].resolved?.dateOfJoining, "2024-03-04");
    assert.equal(out[1].resolved?.firstName, "Zane");
  });
  const t2 = tableFor(await loadWorkbook(new File(["Name\tEmail\tDepartment\nA B\ta@b.co\tEngineering"], "x.tsv")), 0, 0);
  test("tsv file loads", () => assert.deepEqual(t2.headers, ["Name", "Email", "Department"]));
  await assert.rejects(loadWorkbook(new File(["x"], "old.xls")), /xls/);
  passed++;
  console.log("  ✓ legacy .xls gets a clear re-save message");
}

fileChecks().then(() => {
  console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
});
