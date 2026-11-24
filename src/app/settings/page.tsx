import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { SettingsPage } from "@/features/settings/settings-page";

export const metadata = { title: "Settings" };

export default function SettingsRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsPage />
    </Suspense>
  );
}
