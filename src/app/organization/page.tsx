import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { OrganizationPage } from "@/features/organization/organization-page";

export const metadata = { title: "Organization Management" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrganizationPage />
    </Suspense>
  );
}
