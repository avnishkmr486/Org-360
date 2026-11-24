import { WithRouteId } from "@/components/common/with-route-id";
import { processParams } from "@/lib/static-params";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { ProcessWizard } from "@/features/processes/process-wizard";

export const metadata = { title: "Edit Process" };

export const generateStaticParams = processParams;

export default async function EditProcessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WithRouteId Component={ProcessWizard as never} prop="processId" id={decodeURIComponent(id)} />
    </Suspense>
  );
}
