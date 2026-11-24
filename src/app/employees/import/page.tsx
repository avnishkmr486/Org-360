import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/common/states";
import { ImportWizard } from "@/features/employees/import/import-wizard";

export const metadata: Metadata = { title: "Import Employees" };

export default function ImportEmployeesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ImportWizard />
    </Suspense>
  );
}
