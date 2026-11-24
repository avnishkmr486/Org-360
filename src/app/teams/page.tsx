import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { TeamsPage } from "@/features/teams/teams-page";

export const metadata = { title: "Team Management" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeamsPage />
    </Suspense>
  );
}
