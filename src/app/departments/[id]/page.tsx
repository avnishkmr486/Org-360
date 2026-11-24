import { WithRouteId } from "@/components/common/with-route-id";
import { departmentParams } from "@/lib/static-params";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { DepartmentDetail } from "@/features/departments/department-detail";

export const metadata = { title: "Department Details" };

export const generateStaticParams = departmentParams;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WithRouteId Component={DepartmentDetail as never} prop="id" id={decodeURIComponent(id)} />
    </Suspense>
  );
}
