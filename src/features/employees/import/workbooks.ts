/** ExcelJS workbooks for the import flow: standard template and error report. */
import type { Database } from "@/types";
import { downloadBlob } from "@/lib/export/download";
import { IMPORT_FIELDS } from "./fields";
import type { ValidatedRecord } from "./validate";

const NAVY = "FF0B2454";
const TEAL = "FF0D9488";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type TemplateDb = Pick<Database, "organization" | "departments" | "teams" | "bands">;

export async function downloadEmployeeTemplate(db: TemplateDb): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = `${db.organization.name} — Organization 360`;
  const ws = wb.addWorksheet("Employees");
  ws.addRow(IMPORT_FIELDS.map((f) => (f.required ? f.header : f.key === "email" ? `${f.header} (optional)` : f.header)));
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((c, i) => {
    const f = IMPORT_FIELDS[i - 1];
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: f.required ? NAVY : TEAL } };
    c.alignment = { vertical: "middle" };
    c.note = `${f.required ? "Required" : "Optional"}${f.description ? ` — ${f.description}` : ""}`;
  });
  const dept = db.departments.find((d) => d.status === "active")!;
  const team = db.teams.find((t) => t.departmentId === dept.id);
  ws.addRow([
    "EMP-2001",
    "Aarav",
    "Sharma",
    "aarav.sharma@altametrics.example",
    "+91 9812345678",
    db.bands[0]?.code ?? "B1",
    dept.name,
    team?.name ?? "",
    team?.supervisorId ?? "",
    new Date().toISOString().slice(0, 10),
    "Active",
  ]);
  ws.getRow(2).font = { italic: true, color: { argb: "FF64748B" } };
  IMPORT_FIELDS.forEach((f, i) => (ws.getColumn(i + 1).width = Math.max(16, f.header.length + 6)));
  ws.getColumn(4).width = 34;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const ref = wb.addWorksheet("Reference");
  ref.addRow([`${db.organization.name} — valid master data values (names or codes are accepted)`]).font = { bold: true, size: 12, color: { argb: NAVY } };
  ref.addRow([]);
  const cols: [string, string[]][] = [
    ["Departments (name / code)", db.departments.filter((d) => d.status === "active").map((d) => `${d.name} (${d.code})`)],
    ["Teams (department)", db.teams.filter((t) => t.status === "active").map((t) => `${t.name} (${db.departments.find((d) => d.id === t.departmentId)?.name ?? ""})`)],
    ["Bands (code / name)", db.bands.filter((b) => b.status === "active").map((b) => `${b.code} (${b.name})`)],
    ["Employment Status", ["Active", "On Leave", "Inactive"]],
  ];
  const head = ref.addRow(cols.map((c) => c[0]));
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  });
  const max = Math.max(...cols.map((c) => c[1].length));
  for (let i = 0; i < max; i++) ref.addRow(cols.map((c) => c[1][i] ?? ""));
  cols.forEach((_, i) => (ref.getColumn(i + 1).width = 36));

  const notes = wb.addWorksheet("Instructions");
  [
    "How to use this template",
    "0. This template is optional — the importer also accepts files in ANY layout (any sheet, column order or header names). Columns are matched automatically and blanks can use defaults.",
    "1. Enter one employee per row on the 'Employees' sheet. Only a name is required. Navy headers are normally needed (a default can fill them at import time); teal headers — including Email — are optional.",
    "2. Employee ID is the unique key (generated if blank; or matched through the email when one is given). Rows matching an existing employee are offered as updates — nothing is overwritten unless you opt in. Without an ID and an email, re-uploading the file creates the employee again.",
    "3. Department and Band are read from your file: values that are not in Master Data yet can be created automatically (you review and confirm them before the import), and close spellings such as 'Engg' are mapped to the existing record. Team must match the 'Reference' sheet (case-insensitive).",
    "4. Dates may be written as 2026-11-20, 20-Nov-2026 or 20/11/2026. Reporting Manager can be an Employee ID, email or full name.",
    "5. Employees missing from the file are never deleted or changed.",
    "6. Delete the sample row (EMP-2001) before importing, or keep it to try the flow.",
  ].forEach((t, i) => (notes.addRow([t]).font = i === 0 ? { bold: true, size: 12, color: { argb: NAVY } } : {}));
  notes.getColumn(1).width = 120;

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: XLSX_MIME }), "Altametrics_Employee_Import_Template.xlsx");
}

const MASTER_LABEL = { department: "Department", band: "Band" } as const;

/** e.g. 'Department "Engg" → mapped to Engineering; Band "Associate" → will be created'. */
function masterNotes(r: ValidatedRecord): string {
  return (Object.entries(r.master) as [keyof typeof MASTER_LABEL, NonNullable<ValidatedRecord["master"][keyof typeof MASTER_LABEL]>][])
    .map(([field, n]) => `${MASTER_LABEL[field]} "${n.value}" → ${n.kind === "map" ? `mapped to ${n.name}` : n.kind === "create" ? "will be created in Master Data" : "left unresolved"}`)
    .join("; ");
}

export async function downloadErrorReport(records: ValidatedRecord[], organizationName: string, fileName: string): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Import Errors");
  ws.addRow([`${organizationName} — Employee import error report`]).font = { bold: true, size: 13, color: { argb: NAVY } };
  ws.addRow([`Source file: ${fileName} · Generated ${new Date().toLocaleString()}`]).font = { color: { argb: "FF64748B" } };
  ws.addRow([]);
  const head = ws.addRow(["Row", "Result", ...IMPORT_FIELDS.map((f) => f.header), "Errors", "Master data decisions"]);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  });
  for (const r of records) {
    const errs = Object.entries(r.errors).map(([k, msg]) => `${IMPORT_FIELDS.find((f) => f.key === k)?.header}: ${msg}`);
    const row = ws.addRow([r.rowNumber, r.state === "duplicate" ? "Duplicate" : r.state === "invalid" ? "Invalid" : r.state === "update" ? "Existing (update)" : "Valid", ...IMPORT_FIELDS.map((f) => (f.key === "id" ? (r.effectiveId || r.values.id) : (r.effective[f.key] || r.values[f.key]))), errs.join("; "), masterNotes(r)]);
    IMPORT_FIELDS.forEach((f, i) => {
      if (r.errors[f.key]) row.getCell(i + 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDECEC" } };
    });
    if (errs.length) row.getCell(IMPORT_FIELDS.length + 3).font = { color: { argb: "FFC93434" } };
  }
  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 16;
  IMPORT_FIELDS.forEach((f, i) => (ws.getColumn(i + 3).width = Math.max(14, f.header.length + 4)));
  ws.getColumn(IMPORT_FIELDS.length + 3).width = 80;
  ws.getColumn(IMPORT_FIELDS.length + 4).width = 70;
  ws.views = [{ state: "frozen", ySplit: 4 }];
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: XLSX_MIME }), `Employee_Import_Errors_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
