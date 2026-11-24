import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { ProcessHub } from "@/features/processes/process-hub";

export const metadata = { title: "Process Management" };

export default function ProcessesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProcessHub />
    </Suspense>
  );
}
