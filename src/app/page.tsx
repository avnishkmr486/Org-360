import { Suspense } from "react";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { PageSkeleton } from "@/components/common/states";

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardHome />
    </Suspense>
  );
}
