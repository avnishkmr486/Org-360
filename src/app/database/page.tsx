import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { DatabaseStructure } from "@/features/database/database-structure";

export const metadata = { title: "Database Structure" };

export default function DatabasePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DatabaseStructure />
    </Suspense>
  );
}
