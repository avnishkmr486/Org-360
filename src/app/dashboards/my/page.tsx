import { Suspense } from "react";
import { EmployeeDashboard } from "@/components/dashboard/employee-dashboard";
import { PageSkeleton } from "@/components/common/states";

export const metadata = { title: "My Dashboard" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EmployeeDashboard />
    </Suspense>
  );
}
