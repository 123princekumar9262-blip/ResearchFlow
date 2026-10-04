import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/data/workspace";
import { studentNextAction } from "@/lib/domain/next-action";

/**
 * The top bar's Focus button: opens focus mode on the task that matters most
 * now (the Next action's task), else work in progress, else the next to-do.
 */
export default async function FocusPage() {
  const ws = await getWorkspace();
  const { userId, today, profile } = ws;
  if (profile.role !== "student") redirect("/dashboard");

  const loggedToday = ws.myLogs.some((l) => l.log_date === today);
  const action = studentNextAction({ userId, today, tasks: ws.tasks, dependencies: ws.dependencies, remarks: ws.remarks, blockers: ws.blockers, loggedToday });
  const fromAction = action.href.match(/^\/tasks\/([0-9a-f-]{36})/i)?.[1];
  const mine = ws.tasks.filter((t) => (t.assignee_id === userId || t.assignee_id === null) && t.status !== "done");
  const id =
    fromAction ??
    mine.find((t) => t.status === "in_progress" || t.status === "changes_requested")?.id ??
    mine.find((t) => t.status === "todo")?.id;
  redirect(id ? `/tasks/${id}?focus=1` : "/dashboard");
}
