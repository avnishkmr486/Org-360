import { WithRouteId } from "@/components/common/with-route-id";
import { entityParams } from "@/lib/static-params";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { MasterEntityPage } from "@/features/master-data/master-entity-page";

export const metadata = { title: "Master Data" };

export const generateStaticParams = entityParams;

export default async function MasterEntityRoute({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WithRouteId Component={MasterEntityPage as never} prop="slug" id={entity} />
    </Suspense>
  );
}
