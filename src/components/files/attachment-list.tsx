"use client";

import { ExternalLink, FileArchive, FileCode2, FileImage, FileText, Link2, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/components/common/use-server-action";
import { deleteAttachment } from "@/server/actions/attachments";
import type { Attachment } from "@/types/database";

function iconFor(a: Pick<Attachment, "kind" | "mime_type" | "name">) {
  if (a.kind === "link") return Link2;
  const mime = a.mime_type ?? "";
  if (mime.startsWith("image/")) return FileImage;
  if (/zip|tar|gzip|7z/.test(mime) || /\.(zip|tar|gz|7z)$/i.test(a.name)) return FileArchive;
  if (/\.(py|ipynb|m|r|jl|cpp|c|js|ts|json|yaml|yml|sh)$/i.test(a.name)) return FileCode2;
  return FileText;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export type AttachmentView = Attachment & { uploaderName?: string; canDelete?: boolean; context?: string };

/** `flush` drops the outer frame, for lists that sit directly inside a card. */
export function AttachmentList({ attachments, empty, flush = false }: { attachments: AttachmentView[]; empty?: string; flush?: boolean }) {
  const { pending, run } = useServerAction();
  if (attachments.length === 0) return empty ? <p className="text-muted-foreground">{empty}</p> : null;
  return (
    <ul className={flush ? "divide-y border-t" : "divide-y rounded-lg border"}>
      {attachments.map((a) => {
        const Icon = iconFor(a);
        const href = a.kind === "link" ? a.url! : `/api/files/${a.id}`;
        return (
          <li key={a.id} className={cn("group flex items-center gap-2.5 py-2", flush ? "px-3.5" : "px-3")}>
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:underline">
              {a.name}
            </a>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
              {[a.context, a.uploaderName, formatBytes(a.size_bytes), new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {a.kind === "link" && <ExternalLink className="size-3 text-muted-foreground" aria-hidden />}
            {a.canDelete && (
              <Button
                size="icon-xs"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove ${a.name}`}
                disabled={pending}
                onClick={() => confirm(`Remove ${a.name}?`) && run(() => deleteAttachment({ attachmentId: a.id }))}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
