import { requireSession } from "@/lib/auth";
import { getShell } from "@/lib/data/shell";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { CommandPalette } from "@/components/layout/command-palette";
import { InstallBanner } from "@/components/pwa/install";

export default async function AppLayout({ children, modal }: LayoutProps<"/">) {
  const { profile, today } = await requireSession();
  const shell = await getShell();

  return (
    <div className="flex min-h-dvh">
      <Sidebar role={profile.role} shell={shell} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar name={profile.full_name} role={profile.role} inbox={shell.inbox} today={today} />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-5 pb-28 md:px-6 md:pt-6 md:pb-12 lg:px-8">
          <InstallBanner />
          {children}
        </main>
      </div>
      <MobileNav role={profile.role} shell={shell} />
      {modal}
      <CommandPalette role={profile.role} projects={shell.projects} />
    </div>
  );
}
