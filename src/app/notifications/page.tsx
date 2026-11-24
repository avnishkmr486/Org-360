import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { NotificationCenter } from "@/features/notifications/notification-center";

export const metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NotificationCenter />
    </Suspense>
  );
}
