import { Suspense } from "react";
import { TeamDashboard } from "@/components/dashboard/team-dashboard";
import { PageSkeleton } from "@/components/common/states";

export const metadata = { title: "Team Dashboard" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeamDashboard />
    </Suspense>
  );
}
