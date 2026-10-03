import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ATTACHMENTS_BUCKET } from "@/lib/supabase/env";

/**
 * Download an attachment. The row is read through RLS (members only), then the
 * browser is redirected to a signed URL that expires in a minute, so links
 * pasted elsewhere stop working.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: attachment } = await supabase.from("attachments").select("kind, storage_path, url, name").eq("id", id).maybeSingle();
  if (!attachment) return new NextResponse("Not found", { status: 404 });
  if (attachment.kind === "link" && attachment.url) return NextResponse.redirect(attachment.url);

  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(attachment.storage_path!, 60, { download: attachment.name });
  if (error || !data) return new NextResponse("File unavailable", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
