import { Suspense } from "react";
import { ReportsCatalog } from "@/features/reports/report-views";
import { PageSkeleton } from "@/components/common/states";

export const metadata = { title: "Reports & Analytics" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportsCatalog />
    </Suspense>
  );
}
