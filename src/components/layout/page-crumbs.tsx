"use client";

import Link from "next/link";
import { Fragment, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const CRUMB_SLOT_ID = "topbar-crumbs";

export interface Crumb {
  label: string;
  href?: string;
  /** Shown before the label, e.g. ◆ for a milestone. */
  glyph?: string;
}

const noop = () => () => {};

/**
 * Puts a page's breadcrumb in the top bar, where it orients without competing
 * with the page's own title. Phones get a back chevron to the parent instead.
 */
export function PageCrumbs({ items }: { items: Crumb[] }) {
  const slot = useSyncExternalStore(
    noop,
    () => document.getElementById(CRUMB_SLOT_ID),
    () => null,
  );
  if (!slot) return null;
  const parent = [...items].reverse().find((c, i) => i > 0 && c.href) ?? items.find((c) => c.href);

  return createPortal(
    <>
      {parent?.href && (
        <Link href={parent.href} className="flex min-w-0 items-center gap-0.5 text-[15px] font-semibold md:hidden">
          <ChevronLeft className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{parent.label}</span>
        </Link>
      )}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-[13px] md:flex">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          const label = (
            <>
              {c.glyph && <span className="mr-1 text-[10px]">{c.glyph}</span>}
              {c.label}
            </>
          );
          return (
            <Fragment key={i}>
              {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />}
              {c.href && !last ? (
                <Link href={c.href} className="max-w-56 shrink truncate text-muted-foreground transition-colors hover:text-foreground">
                  {label}
                </Link>
              ) : (
                <span className="min-w-0 truncate font-medium" aria-current={last ? "page" : undefined}>
                  {label}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>
    </>,
    slot,
  );
}
