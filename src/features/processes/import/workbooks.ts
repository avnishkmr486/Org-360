/** ExcelJS workbooks for the process import: standard template and error report. */
import type { Database } from "@/types";
import { downloadBlob } from "@/lib/export/download";
import { PROCESS_FIELDS, STEP_FIELDS, type FieldDef, type ProcessFieldKey } from "./fields";
import type { ValidatedRecord } from "./validate";

const NAVY = "FF0B2454";
const TEAL = "FF0D9488";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type TemplateDb = Pick<Database, "organization" | "departments" | "teams" | "employees" | "processCategories">;

/** Process ID is auto-generated, so it is never a template column. */
export const TEMPLATE_FIELDS = PROCESS_FIELDS.filter((f) => f.key !== "id");

const headerLabel = <K extends string>(f: FieldDef<K>) => (f.required || f.templateRequired ? `${f.header}*` : f.header);

function styleHeader<K extends string>(row: import("exceljs").Row, fields: FieldDef<K>[]) {
  row.height = 24;
  row.eachCell((c, i) => {
    const f = fields[i - 1];
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: f.required || f.templateRequired ? NAVY : TEAL } };
    c.alignment = { vertical: "middle", wrapText: true };
    c.note = `${f.required ? "Required" : f.templateRequired ? "Recommended (can be defaulted during import)" : "Optional"}${f.description ? ` — ${f.description}` : ""}`;
  });
}

const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

export async function downloadProcessTemplate(db: TemplateDb): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = `${db.organization.name} — Organization 360`;

  const categories = db.processCategories.filter((c) => c.status === "active");
  const departments = db.departments.filter((d) => d.status === "active");
  const teams = db.teams.filter((t) => t.status === "active");
  const employees = db.employees.filter((e) => e.status !== "inactive");
  const dept = departments[0];
  const team = teams.find((t) => t.departmentId === dept?.id);
  const members = employees.filter((e) => e.departmentId === dept?.id).slice(0, 2);
  const owner = employees.find((e) => e.id === dept?.headId) ?? employees[0];
  const today = new Date().toISOString().slice(0, 10);

  /* ---- Processes ---- */
  const ws = wb.addWorksheet("Processes");
  styleHeader(ws.addRow(TEMPLATE_FIELDS.map(headerLabel)), TEMPLATE_FIELDS);
  const sample = (over: Partial<Record<ProcessFieldKey, string>>): string[] => {
    const base: Record<ProcessFieldKey, string> = {
      id: "",
      name: "Sample: Weekly Release Health Review",
      category: categories[0]?.name ?? "",
      description: "Review the health of the week's releases and agree corrective actions.",
      objective: "No unresolved release incident older than 5 working days.",
      department: dept?.name ?? "",
      appliedAt: "Department",
      appliedDepartments: dept?.name ?? "",
      appliedTeams: "",
      appliedEmployees: "",
      owner: owner?.id ?? "",
      responsible: "",
      reviewer: "",
      frequency: "Weekly",
      customInterval: "",
      startDate: today,
      endDate: "",
      priority: "Medium",
      risk: "Medium",
      threshold: "90",
      status: "Draft",
      mandatory: "Yes",
      approval: "No",
      slaDays: "5",
      successMetric: "≥ 90% of reviews completed on time",
      meetingDate: "",
      meetingAgenda: "Release health, open incidents, blockers",
      followUpDate: "",
      followUpAction: "",
      followUpOwner: "",
      nextReviewDate: "",
      escalation: "",
      stakeholders: "",
      tags: "release, quality",
      remarks: "",
      steps: "Collect incident list | Pull open incidents from the tracker | 15 | N | N | Y\nReview with the team | Walk through each incident | 30 | N | N | Y\nPublish summary | Post actions in the channel | 10 | Y | N | Y",
    };
    const merged = { ...base, ...over };
    return TEMPLATE_FIELDS.map((f) => merged[f.key]);
  };
  const rows = [
    sample({}),
    sample({
      name: "Sample: Team Onboarding Buddy Check",
      appliedAt: "Team",
      appliedDepartments: dept?.name ?? "",
      appliedTeams: team?.name ?? "",
      frequency: "Monthly",
      steps: "",
      remarks: "Steps for this process are listed on the 'Steps' sheet.",
    }),
    sample({
      name: "Sample: Individual Security Acknowledgement",
      appliedAt: "Employee",
      appliedDepartments: dept?.name ?? "",
      appliedEmployees: members.map((m) => m.id).join(", "),
      frequency: "Annually",
      approval: "Yes",
      steps: "",
    }),
  ];
  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.font = { italic: true, color: { argb: "FF64748B" } };
  });
  TEMPLATE_FIELDS.forEach((f, i) => {
    const w = ["description", "objective", "steps", "meetingAgenda", "followUpAction", "remarks", "successMetric"].includes(f.key) ? 44 : Math.max(16, f.header.length + 6);
    ws.getColumn(i + 1).width = w;
    ws.getColumn(i + 1).alignment = { vertical: "top", wrapText: ["steps", "description", "objective", "meetingAgenda", "followUpAction", "remarks"].includes(f.key) };
  });
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];

  /* ---- Steps ---- */
  const st = wb.addWorksheet("Steps");
  styleHeader(st.addRow(STEP_FIELDS.map(headerLabel)), STEP_FIELDS);
  const sampleSteps = [
    ["Sample: Team Onboarding Buddy Check", "1", "Introduce the buddy", "Schedule the intro call", "Book 30 minutes in week 1", "Yes", "30", "No", "No", ""],
    ["Sample: Team Onboarding Buddy Check", "2", "30-day check-in", "Capture feedback in the tracker", "Use the check-in form", "Yes", "45", "Yes", "Yes", ""],
  ];
  sampleSteps.forEach((r) => {
    const row = st.addRow(r);
    row.font = { italic: true, color: { argb: "FF64748B" } };
  });
  STEP_FIELDS.forEach((f, i) => (st.getColumn(i + 1).width = ["name", "description", "instructions", "processName"].includes(f.key) ? 40 : 18));
  st.views = [{ state: "frozen", ySplit: 1 }];

  /* ---- Reference ---- */
  const ref = wb.addWorksheet("Reference");
  ref.addRow([`${db.organization.name} — valid values (names, codes or IDs are accepted; matching is case-insensitive)`]).font = { bold: true, size: 12, color: { argb: NAVY } };
  ref.addRow([]);
  const cols: [string, string[]][] = [
    ["Categories", categories.map((c) => c.name)],
    ["Departments (name / code)", departments.map((d) => `${d.name} (${d.code})`)],
    ["Teams (department)", teams.map((t) => `${t.name} (${departments.find((d) => d.id === t.departmentId)?.name ?? ""})`)],
    ["Frequencies", ["Daily", "Weekly", "Monthly", "Quarterly", "Annually", "Event Based", "Custom"]],
    ["Priorities", ["Low", "Medium", "High", "Critical"]],
    ["Risk levels", ["Low", "Medium", "High"]],
    ["Statuses", ["Draft", "Active", "Under Review", "Inactive"]],
    ["Applied At", ["Department", "Team", "Employee"]],
    ["Employees (ID — name)", employees.map((e) => `${e.id} — ${fullName(e)}`)],
  ];
  const head = ref.addRow(cols.map((c) => c[0]));
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  });
  const max = Math.max(...cols.map((c) => c[1].length));
  for (let i = 0; i < max; i++) ref.addRow(cols.map((c) => c[1][i] ?? ""));
  cols.forEach((_, i) => (ref.getColumn(i + 1).width = 38));

  /* ---- Dropdowns on the Processes sheet ---- */
  const colOf = (key: ProcessFieldKey) => TEMPLATE_FIELDS.findIndex((f) => f.key === key) + 1;
  const inline = (key: ProcessFieldKey, list: string) => {
    for (let r = 2; r <= 300; r++) ws.getCell(r, colOf(key)).dataValidation = { type: "list", allowBlank: true, formulae: [`"${list}"`] };
  };
  const ranged = (key: ProcessFieldKey, colLetter: string, count: number) => {
    if (!count) return;
    for (let r = 2; r <= 300; r++) ws.getCell(r, colOf(key)).dataValidation = { type: "list", allowBlank: true, formulae: [`Reference!$${colLetter}$4:$${colLetter}$${3 + count}`] };
  };
  ranged("category", "A", categories.length);
  ranged("department", "B", 0); // reference shows "name (code)"; keep free text for the owning department
  inline("appliedAt", "Department,Team,Employee");
  inline("frequency", "Daily,Weekly,Monthly,Quarterly,Annually,Event Based,Custom");
  inline("priority", "Low,Medium,High,Critical");
  inline("risk", "Low,Medium,High");
  inline("status", "Draft,Active,Under Review,Inactive");
  inline("mandatory", "Yes,No");
  inline("approval", "Yes,No");

  /* ---- Instructions ---- */
  const notes = wb.addWorksheet("Instructions");
  [
    "How to use this template",
    "1. Enter one process per row on the 'Processes' sheet. Navy headers are recommended; only Process Name is strictly required — anything left blank can be filled from the defaults you choose during import.",
    "2. Process ID is generated automatically (PRC-nnn). Do not add it. If you upload a file that has a Process ID column it is ignored unless you choose to match existing processes by ID.",
    "3. 'Applied At' sets the level (Department / Team / Employee). List several departments, teams or employees separated by commas or semicolons. Teams and employees are looked up from the employee data. If Applied At is blank it is inferred: employees given → Employee, teams given → Team, otherwise Department.",
    "4. Steps: either put one step per line in the 'Steps' column  (Step name | description | minutes | evidence Y/N | approval Y/N | mandatory Y/N)  or list them on the 'Steps' sheet, linked by Process Name.",
    "5. People (owner, reviewer, responsible, escalation, follow-up owner, stakeholders) can be Employee IDs, e-mail addresses or full names.",
    "6. Dates accept yyyy-mm-dd, dd/mm/yyyy, 20-Nov-2026 and Excel dates. Yes/No columns accept Yes/No/Y/N/True/False.",
    "7. Processes that already exist (same name) are offered as updates. Nothing is overwritten unless you opt in, only the columns present in your file are updated, and processes missing from the file are never deleted.",
    "8. Delete the three sample rows (and the sample steps) before importing, or keep them to try the flow.",
    "9. Your own file does not need to match this layout — columns can be in any order, with different names, on any sheet. The wizard lets you map them.",
  ].forEach((t, i) => {
    const r = notes.addRow([t]);
    r.alignment = { wrapText: true, vertical: "top" };
    if (i === 0) r.font = { bold: true, size: 12, color: { argb: NAVY } };
  });
  notes.getColumn(1).width = 130;

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: XLSX_MIME }), "Altametrics_Process_Import_Template.xlsx");
}

export async function downloadProcessErrorReport(records: ValidatedRecord[], organizationName: string, fileName: string): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Import Errors");
  ws.addRow([`${organizationName} — Process import error report`]).font = { bold: true, size: 13, color: { argb: NAVY } };
  ws.addRow([`Source file: ${fileName} · Generated ${new Date().toLocaleString()}`]).font = { color: { argb: "FF64748B" } };
  ws.addRow([]);
  const fields = PROCESS_FIELDS;
  const head = ws.addRow(["Row", "Result", ...fields.map((f) => f.header), "Errors", "Notes"]);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  });
  const label: Record<string, string> = { duplicate: "Duplicate", invalid: "Invalid", update: "Existing (update)", valid: "Valid" };
  for (const r of records) {
    const errs = Object.entries(r.errors).map(([k, msg]) => `${fields.find((f) => f.key === k)?.header ?? k}: ${msg}`);
    const row = ws.addRow([r.rowNumber, label[r.state], ...fields.map((f) => r.values[f.key]), errs.join("; "), r.infos.join("; ")]);
    fields.forEach((f, i) => {
      if (r.errors[f.key]) row.getCell(i + 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDECEC" } };
    });
    if (errs.length) row.getCell(fields.length + 3).font = { color: { argb: "FFC93434" } };
  }
  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 16;
  fields.forEach((f, i) => (ws.getColumn(i + 3).width = Math.max(14, f.header.length + 4)));
  ws.getColumn(fields.length + 3).width = 90;
  ws.getColumn(fields.length + 4).width = 60;
  ws.views = [{ state: "frozen", ySplit: 4 }];
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: XLSX_MIME }), `Process_Import_Errors_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
