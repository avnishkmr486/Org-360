import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { TeamDetail } from "@/features/teams/team-detail";

export const metadata = { title: "Team Dashboard" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeamDetail id={decodeURIComponent(id)} />
    </Suspense>
  );
}
