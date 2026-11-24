import { Suspense } from "react";
import { ReportViewer } from "@/features/reports/report-views";
import { PageSkeleton } from "@/components/common/states";

export const metadata = { title: "Report" };

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportViewer reportId={reportId} />
    </Suspense>
  );
}
