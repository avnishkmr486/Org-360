import { processParams } from "@/lib/static-params";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { ProcessDetail } from "@/features/processes/process-detail";

export const metadata = { title: "Process Details" };

export const generateStaticParams = processParams;

export default async function ProcessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProcessDetail id={decodeURIComponent(id)} />
    </Suspense>
  );
}
