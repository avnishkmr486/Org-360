import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/common/states";
import { EmployeeDirectory } from "@/features/employees/employee-directory";

export const metadata: Metadata = { title: "Employee Directory" };

export default function EmployeesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EmployeeDirectory />
    </Suspense>
  );
}
