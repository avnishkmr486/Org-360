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
      <TaskDetail taskId={decodeURIComponent(taskId)} />
    </Suspense>
  );
}
