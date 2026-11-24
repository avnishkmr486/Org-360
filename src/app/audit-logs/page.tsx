import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { AuditLogs } from "@/features/audit/audit-logs";

export const metadata = { title: "Audit Logs" };

export default function AuditLogsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AuditLogs />
    </Suspense>
  );
}
