/**
 * Branded PDF export using jsPDF + jspdf-autotable (lazy-loaded).
 */
import { format } from "date-fns";
import { safeFileName } from "./download";

export interface PdfColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
}

export interface PdfExportOptions<T> {
  organizationName: string;
  title: string;
  subtitle?: string;
  filters?: string[];
  fileName: string;
  columns: PdfColumn<T>[];
  rows: T[];
  summary?: { label: string; value: string | number }[];
  footer?: string;
  orientation?: "portrait" | "landscape";
}

const NAVY: [number, number, number] = [11, 36, 84];
const TEAL: [number, number, number] = [13, 148, 136];
const SLATE: [number, number, number] = [71, 85, 105];

export async function exportToPdf<T>(opts: PdfExportOptions<T>): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: opts.orientation ?? (opts.columns.length > 6 ? "landscape" : "portrait"), unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  const drawHeader = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageW, 58, "F");
    doc.setFillColor(...TEAL);
    doc.rect(0, 58, pageW, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(opts.organizationName, margin, 26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Organization 360  ·  Process. Performance. Accountability.", margin, 42);
    doc.text(format(new Date(), "dd MMM yyyy, hh:mm a"), pageW - margin, 26, { align: "right" });
  };

  drawHeader();
  let y = 88;
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(opts.title, margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE);
  if (opts.subtitle) {
    doc.text(opts.subtitle, margin, y);
    y += 13;
  }
  for (const f of opts.filters ?? []) {
    doc.text(f, margin, y);
    y += 12;
  }

  if (opts.summary?.length) {
    y += 6;
    const boxW = (pageW - margin * 2 - (opts.summary.length - 1) * 8) / opts.summary.length;
    opts.summary.forEach((s, i) => {
      const x = margin + i * (boxW + 8);
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, boxW, 42, 4, 4, "FD");
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE);
      doc.text(s.label.toUpperCase(), x + 8, y + 14, { maxWidth: boxW - 16 });
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      doc.text(String(s.value), x + 8, y + 33);
      doc.setFont("helvetica", "normal");
    });
    y += 54;
  }

  autoTable(doc, {
    startY: y + 4,
    margin: { left: margin, right: margin, top: 76, bottom: 40 },
    head: [opts.columns.map((c) => c.header)],
    body: opts.rows.map((r) => opts.columns.map((c) => String(c.value(r) ?? ""))),
    styles: { fontSize: 8, cellPadding: 5, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 246, 250] },
    columnStyles: Object.fromEntries(opts.columns.map((c, i) => [i, { halign: c.align ?? "left" }])),
    didDrawPage: () => {
      drawHeader();
    },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(opts.footer ?? `© ${new Date().getFullYear()} ${opts.organizationName}. Confidential.`, margin, pageH - 18);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 18, { align: "right" });
  }
  doc.save(`${safeFileName(opts.fileName)}.pdf`);
}
