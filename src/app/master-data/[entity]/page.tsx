import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { MasterEntityPage } from "@/features/master-data/master-entity-page";

export const metadata = { title: "Master Data" };

export default async function MasterEntityRoute({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MasterEntityPage slug={entity} />
    </Suspense>
  );
}
