"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Excel / PDF export dropdown with busy + success/error feedback. */
export function ExportMenu({ onExcel, onPdf, label = "Export", disabled }: { onExcel?: () => Promise<void>; onPdf?: () => Promise<void>; label?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState<null | "excel" | "pdf">(null);
  const run = async (kind: "excel" | "pdf", fn?: () => Promise<void>) => {
    if (!fn) return;
    setBusy(kind);
    try {
      await fn();
      toast.success(`${kind === "excel" ? "Excel" : "PDF"} export downloaded`);
    } catch (err) {
      console.error(err);
      toast.error("Export failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || busy !== null}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Branded export</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onExcel ? (
          <DropdownMenuItem onSelect={() => run("excel", onExcel)}>
            <FileSpreadsheet className="text-success" /> Excel (.xlsx)
          </DropdownMenuItem>
        ) : null}
        {onPdf ? (
          <DropdownMenuItem onSelect={() => run("pdf", onPdf)}>
            <FileText className="text-danger" /> PDF document
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
