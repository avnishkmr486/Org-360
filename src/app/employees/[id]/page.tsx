import { WithRouteId } from "@/components/common/with-route-id";
import { employeeParams } from "@/lib/static-params";
import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/common/states";
import { EmployeeProfile } from "@/features/employees/employee-profile";

export const metadata: Metadata = { title: "Employee Profile" };

export const generateStaticParams = employeeParams;

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WithRouteId Component={EmployeeProfile as never} prop="id" id={decodeURIComponent(id)} />
    </Suspense>
  );
}
