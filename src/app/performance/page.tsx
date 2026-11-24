import { Suspense } from "react";
import { PerformancePage } from "@/features/performance/performance-page";
import { PageSkeleton } from "@/components/common/states";

export const metadata = { title: "Employee Performance" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PerformancePage />
    </Suspense>
  );
}
