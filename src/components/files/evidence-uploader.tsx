"use client";

import { useRef, useState } from "react";
import { Link2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerAction } from "@/components/common/use-server-action";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENTS_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/supabase/env";
import { addLink, recordUpload } from "@/server/actions/attachments";

type Target = { taskId?: string; logId?: string; remarkId?: string };

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120) || "file";
}

/**
 * Attach evidence: files go straight from the browser to private storage (the
 * storage policy checks project membership), then the server records them.
 * Links cover commits, Overleaf, Drive, W&B runs and the like.
 */
export function EvidenceUploader({ projectId, target, compact }: { projectId: string; target: Target; compact?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const link = useServerAction();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const supabase = createClient();
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} is over 50 MB. Link to it instead.`);
        continue;
      }
      setUploading(file.name);
      const path = `${projectId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) {
        toast.error(`Couldn't upload ${file.name}: ${error.message}`);
        continue;
      }
      const result = await recordUpload({ projectId, storagePath: path, name: file.name, mimeType: file.type || null, size: file.size, ...target });
      if (result.ok) toast.success(`${file.name} attached`);
      else {
        toast.error(result.error);
        await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
      }
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input ref={fileInput} type="file" multiple className="sr-only" onChange={(e) => upload(e.target.files)} aria-label="Choose files to attach" />
        <Button type="button" variant="outline" size={compact ? "xs" : "sm"} disabled={!!uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {uploading ? `Uploading ${uploading.length > 24 ? `${uploading.slice(0, 22)}…` : uploading}` : "Upload file"}
        </Button>
        <Button type="button" variant="outline" size={compact ? "xs" : "sm"} onClick={() => setLinkOpen((o) => !o)}>
          <Link2 /> Add link
        </Button>
      </div>
      {linkOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            link.run(() => addLink({ projectId, url, ...target }), {
              onSuccess: () => {
                setUrl("");
                setLinkOpen(false);
              },
            });
          }}
          className="flex gap-2"
        >
          <Input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/…/commit/…"
            className="h-8"
            autoFocus
            aria-label="Link URL"
          />
          <Button type="submit" size="sm" disabled={link.pending}>
            {link.pending && <Loader2 className="animate-spin" />} Attach
          </Button>
        </form>
      )}
    </div>
  );
}
