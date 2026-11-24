import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { EcosystemPage } from "@/features/ecosystem/ecosystem-page";

export const metadata = { title: "Ecosystem" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EcosystemPage />
    </Suspense>
  );
}
