"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { adminClient } from "@/lib/supabase/admin";
import { id, isoDate, longText, optionalDate, title } from "@/lib/validation";

const createSchema = z.object({
  title,
  description: longText(10000),
  startDate: isoDate,
  targetEndDate: optionalDate,
  memberIds: z.array(id).max(30).default([]),
});

export async function createProject(input: z.input<typeof createSchema>) {
  return action(createSchema, input, async (d, { supabase }) => {
    if (d.targetEndDate && d.targetEndDate < d.startDate) return fail("The target end date must be after the start date.");
    const projectId = unwrap(
      await supabase.rpc("create_project", {
        p_title: d.title,
        p_description: d.description,
        p_start_date: d.startDate,
        p_target_end_date: d.targetEndDate,
        p_member_ids: d.memberIds,
      }),
    );
    refresh();
    return ok(projectId, "Project created");
  });
}

const updateSchema = z.object({
  projectId: id,
  title: title.optional(),
  description: longText(10000).optional(),
  status: z.enum(["active", "on_hold", "completed", "archived"]).optional(),
  targetEndDate: optionalDate,
});

export async function updateProject(input: z.input<typeof updateSchema>) {
  return action(updateSchema, input, async (d, { supabase }) => {
    const patch: { title?: string; description?: string; status?: typeof d.status; target_end_date?: string | null } = {};
    if (d.title !== undefined) patch.title = d.title;
    if (d.description !== undefined) patch.description = d.description;
    if (d.status !== undefined) patch.status = d.status;
    if (input.targetEndDate !== undefined) patch.target_end_date = d.targetEndDate;
    const rows = unwrap(await supabase.from("projects").update(patch).eq("id", d.projectId).select("id"));
    if (rows.length === 0) return fail("You can't edit this project.");
    refresh();
    return ok(null, "Project updated");
  });
}

const memberSchema = z.object({ projectId: id, userId: id });

export async function addProjectMember(input: z.input<typeof memberSchema>) {
  return action(memberSchema, input, async (d, { supabase }) => {
    unwrap(await supabase.rpc("add_project_member", { p_project: d.projectId, p_user: d.userId }));
    refresh();
    return ok(null, "Member added");
  });
}

export async function removeProjectMember(input: z.input<typeof memberSchema>) {
  return action(memberSchema, input, async (d, { supabase }) => {
    const rows = unwrap(
      await supabase.from("project_members").delete().eq("project_id", d.projectId).eq("user_id", d.userId).select("user_id"),
    );
    if (rows.length === 0) return fail("Only the project's professor can remove members.");
    refresh();
    return ok(null, "Member removed");
  });
}

/**
 * Deletes a project and everything in it (its creator only, with the title
 * typed back). Uploaded files are removed from storage afterwards; the
 * database rows go with the project through ON DELETE CASCADE.
 */
export async function deleteProject(input: { projectId: string; confirmTitle: string }) {
  return action(z.object({ projectId: id, confirmTitle: z.string().max(300) }), input, async (d, { supabase }) => {
    const { data: files } = await supabase.from("attachments").select("storage_path").eq("project_id", d.projectId).not("storage_path", "is", null);
    unwrap(await supabase.rpc("delete_project", { p_project: d.projectId, p_confirm_title: d.confirmTitle }));
    const paths = (files ?? []).flatMap((f) => (f.storage_path ? [f.storage_path] : []));
    if (paths.length) {
      // Other members' uploads too, so this needs the server key; a failure only leaves unreachable files behind.
      try {
        await adminClient()?.storage.from("attachments").remove(paths);
      } catch {
        /* storage cleanup is best effort */
      }
    }
    refresh();
    return ok(null, "Project deleted");
  });
}
