import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { DepartmentsPage } from "@/features/departments/departments-page";

export const metadata = { title: "Department Management" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DepartmentsPage />
    </Suspense>
  );
}
