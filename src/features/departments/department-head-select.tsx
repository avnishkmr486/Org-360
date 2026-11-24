"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Database } from "@/types";
import { Combobox, type Option } from "@/components/common/filters";
import { assignDepartmentHead } from "@/lib/repositories";

/** Only people above this band level can head a department (L9 and up). */
export const MIN_HEAD_BAND_LEVEL = 8;

/**
 * Employees who can be picked as a department head: active, with a band above L8.
 * The current head is always kept in the list so an existing assignment still displays.
 */
export function departmentHeadOptions(db: Database, currentHeadId: string | null): Option[] {
  const level = new Map(db.bands.map((b) => [b.id, b.level]));
  const band = new Map(db.bands.map((b) => [b.id, b.code]));
  const dept = new Map(db.departments.map((d) => [d.id, d.name]));
  return db.employees
    .filter((e) => e.id === currentHeadId || (e.status !== "inactive" && (level.get(e.bandId) ?? 0) > MIN_HEAD_BAND_LEVEL))
    .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim(), hint: `${band.get(e.bandId) ?? ""} · ${dept.get(e.departmentId) ?? ""}` }));
}

/** Inline searchable dropdown to set a department's head straight from the list. */
export function DepartmentHeadSelect({ db, departmentId, headId, readOnly }: { db: Database; departmentId: string; headId: string | null; readOnly?: boolean }) {
  const options = useMemo(() => departmentHeadOptions(db, headId), [db, headId]);
  const [busy, setBusy] = useState(false);
  return (
    <div onClick={(e) => e.stopPropagation()} className="w-56">
      <Combobox
        value={headId}
        options={options}
        disabled={readOnly || busy}
        placeholder="Select head"
        searchPlaceholder="Search employees above L8…"
        emptyText="No eligible employee found."
        className="h-8 text-sm"
        onChange={async (id) => {
          setBusy(true);
          try {
            await assignDepartmentHead(departmentId, id);
            toast.success(id ? "Department head updated" : "Department head cleared");
          } catch (e) {
            toast.error("Could not update the department head", { description: e instanceof Error ? e.message : undefined });
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
