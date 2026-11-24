import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { ApprovalsQueue } from "@/features/compliance/approvals-queue";

export const metadata = { title: "Review Queue" };

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ApprovalsQueue />
    </Suspense>
  );
}
