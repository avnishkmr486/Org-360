import { WithRouteId } from "@/components/common/with-route-id";
import { reportParams } from "@/lib/static-params";
import { Suspense } from "react";
import { ReportViewer } from "@/features/reports/report-views";
import { PageSkeleton } from "@/components/common/states";

export const metadata = { title: "Report" };

export const generateStaticParams = reportParams;

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WithRouteId Component={ReportViewer as never} prop="reportId" id={reportId} />
    </Suspense>
  );
}
