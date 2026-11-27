import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { SupportTicketsDashboard } from "@/features/support-tickets/support-tickets-dashboard";

export const metadata = { title: "Support Tickets" };

export default function SupportTicketsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SupportTicketsDashboard />
    </Suspense>
  );
}
