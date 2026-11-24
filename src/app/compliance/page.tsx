import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { ComplianceTracker } from "@/features/compliance/compliance-tracker";

export const metadata = { title: "Compliance Tracking" };

export default function CompliancePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComplianceTracker />
    </Suspense>
  );
}
