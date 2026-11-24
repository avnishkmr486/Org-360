import { WithRouteId } from "@/components/common/with-route-id";
import { teamParams } from "@/lib/static-params";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { TeamDetail } from "@/features/teams/team-detail";

export const metadata = { title: "Team Dashboard" };

export const generateStaticParams = teamParams;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WithRouteId Component={TeamDetail as never} prop="id" id={decodeURIComponent(id)} />
    </Suspense>
  );
}
