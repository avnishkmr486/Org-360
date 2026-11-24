import { Suspense } from "react";
import { DepartmentDashboard } from "@/components/dashboard/department-dashboard";
import { PageSkeleton } from "@/components/common/states";

export const metadata = { title: "Department Dashboard" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DepartmentDashboard />
    </Suspense>
  );
}
