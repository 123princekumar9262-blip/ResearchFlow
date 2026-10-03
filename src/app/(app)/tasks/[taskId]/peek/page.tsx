import { redirect } from "next/navigation";

/** Opened directly (a reload or a shared link), the preview is just the task. */
export default async function TaskPeekPage({ params }: PageProps<"/tasks/[taskId]/peek">) {
  const { taskId } = await params;
  redirect(`/tasks/${taskId}`);
}
