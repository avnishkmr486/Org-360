import { ecoParams } from "@/lib/static-params";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { EntityDetail } from "@/features/ecosystem/entity-detail";

export const metadata = { title: "Ecosystem entry" };

export const generateStaticParams = ecoParams;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EntityDetail id={decodeURIComponent(id)} />
    </Suspense>
  );
}
