import { brandIcon } from "@/lib/brand-icon";

const SIZES = new Set([192, 512]);

/**
 * Icons for the web app manifest. Maskable (default) fills the square so the
 * phone can crop it to its own shape; `?purpose=any` is the rounded tile for
 * desktops and launchers that show the icon as is.
 */
export async function GET(request: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const size = Number((await ctx.params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const bleed = new URL(request.url).searchParams.get("purpose") !== "any";
  return brandIcon(size, { bleed });
}
