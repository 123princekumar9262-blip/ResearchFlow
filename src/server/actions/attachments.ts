"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { ATTACHMENTS_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/supabase/env";
import { id, optionalId } from "@/lib/validation";

const targets = { taskId: optionalId, logId: optionalId, remarkId: optionalId };

const uploadSchema = z.object({
  projectId: id,
  storagePath: z.string().min(1).max(600),
  name: z.string().trim().min(1).max(300),
  mimeType: z.string().max(200).nullable().default(null),
  size: z.number().int().min(0).max(MAX_UPLOAD_BYTES, "Files can be up to 50 MB."),
  ...targets,
});

/**
 * Records a file the browser already uploaded straight to storage (uploads
 * skip the server: Server Actions are capped at 1 MB). Storage policies
 * already checked membership; the path must sit in the project's folder.
 */
export async function recordUpload(input: z.input<typeof uploadSchema>) {
  return action(uploadSchema, input, async (d, { supabase, userId }) => {
    if (!d.storagePath.startsWith(`${d.projectId}/`)) return fail("That file isn't in this project's folder.");
    const row = unwrap(
      await supabase
        .from("attachments")
        .insert({
          project_id: d.projectId,
          uploader_id: userId,
          kind: "file",
          name: d.name,
          storage_path: d.storagePath,
          mime_type: d.mimeType,
          size_bytes: d.size,
          task_id: d.taskId,
          progress_log_id: d.logId,
          remark_id: d.remarkId,
        })
        .select("id")
        .single(),
    );
    refresh();
    return ok(row.id, "File attached");
  });
}

const linkSchema = z.object({
  projectId: id,
  url: z.url({ protocol: /^https?$/, error: "Enter a full link starting with http:// or https://" }).max(2000),
  name: z.string().trim().max(300).default(""),
  ...targets,
});

export async function addLink(input: z.input<typeof linkSchema>) {
  return action(linkSchema, input, async (d, { supabase, userId }) => {
    const name = d.name || new URL(d.url).hostname + new URL(d.url).pathname.replace(/\/$/, "");
    const row = unwrap(
      await supabase
        .from("attachments")
        .insert({
          project_id: d.projectId,
          uploader_id: userId,
          kind: "link",
          name: name.slice(0, 300),
          url: d.url,
          task_id: d.taskId,
          progress_log_id: d.logId,
          remark_id: d.remarkId,
        })
        .select("id")
        .single(),
    );
    refresh();
    return ok(row.id, "Link attached");
  });
}

export async function deleteAttachment(input: { attachmentId: string }) {
  return action(z.object({ attachmentId: id }), input, async (d, { supabase }) => {
    const rows = unwrap(await supabase.from("attachments").delete().eq("id", d.attachmentId).select("storage_path"));
    if (rows.length === 0) {
      return fail("You can only remove your own uploads within 24 hours, and never evidence on a task under review or done.");
    }
    const path = rows[0].storage_path;
    if (path) await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
    refresh();
    return ok(null, "Attachment removed");
  });
}
