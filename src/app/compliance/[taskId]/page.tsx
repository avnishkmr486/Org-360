import { WithRouteId } from "@/components/common/with-route-id";
import { taskParams } from "@/lib/static-params";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { TaskDetail } from "@/features/compliance/task-detail";

export const metadata = { title: "Submission Details" };

export const generateStaticParams = taskParams;

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WithRouteId Component={TaskDetail as never} prop="taskId" id={decodeURIComponent(taskId)} />
    </Suspense>
  );
}
