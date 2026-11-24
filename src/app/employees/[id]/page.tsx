import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/common/states";
import { EmployeeProfile } from "@/features/employees/employee-profile";

export const metadata: Metadata = { title: "Employee Profile" };

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EmployeeProfile id={decodeURIComponent(id)} />
    </Suspense>
  );
}
