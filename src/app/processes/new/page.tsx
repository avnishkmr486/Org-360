import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { ProcessWizard } from "@/features/processes/process-wizard";

export const metadata = { title: "Create Process" };

export default function NewProcessPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProcessWizard />
    </Suspense>
  );
}
