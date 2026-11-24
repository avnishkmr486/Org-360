import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { MasterDataHome } from "@/features/master-data/master-data-home";

export const metadata = { title: "Master Data" };

export default function MasterDataPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MasterDataHome />
    </Suspense>
  );
}
