"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Laptop, Loader2, Moon, Sun, Unlink } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/common/ui-bits";
import { useBrowserTimezone } from "@/components/common/use-browser-timezone";
import { useServerAction } from "@/components/common/use-server-action";
import { unlinkSupervision, updateProfile } from "@/server/actions/profile";

export function ProfileForm({ fullName, timezone }: { fullName: string; timezone: string }) {
  const { pending, run } = useServerAction();
  const browserTz = useBrowserTimezone(timezone);
  return (
    <form
      action={(form) => run(() => updateProfile({ fullName: String(form.get("fullName")), timezone: String(form.get("timezone")) }))}
      className="space-y-4 p-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="pf-name">Name</Label>
        <Input id="pf-name" name="fullName" defaultValue={fullName} required maxLength={120} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-tz">Timezone</Label>
        <Input id="pf-tz" name="timezone" defaultValue={timezone} required list="timezones" />
        <datalist id="timezones">
          {(typeof Intl !== "undefined" && "supportedValuesOf" in Intl ? Intl.supportedValuesOf("timeZone") : []).map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          Decides when your day starts and ends, for deadlines and logs.
          {browserTz !== timezone && ` This device is set to ${browserTz}.`}
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Save
      </Button>
    </form>
  );
}

const noopSubscribe = () => () => {};

export function ThemePicker() {
  const { theme: storedTheme, setTheme } = useTheme();
  // The stored theme is only known in the browser; render none selected until hydrated.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const theme = hydrated ? storedTheme : undefined;
  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Laptop },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 p-4" role="radiogroup" aria-label="Theme">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          onClick={() => setTheme(o.value)}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors",
            theme === o.value ? "border-primary bg-primary/5" : "hover:bg-accent",
          )}
        >
          <o.icon className="size-4" /> {o.label}
        </button>
      ))}
    </div>
  );
}

export function LinkedPeople({ people }: { people: { id: string; full_name: string; role: string }[] }) {
  const { pending, run } = useServerAction();
  if (people.length === 0) return <p className="p-4 text-muted-foreground">Nobody linked yet.</p>;
  return (
    <ul className="divide-y">
      {people.map((p) => (
        <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
          <UserAvatar name={p.full_name} />
          <span className="flex-1">{p.full_name}</span>
          <span className="text-xs text-muted-foreground capitalize">{p.role}</span>
          <Button
            size="xs"
            variant="ghost"
            disabled={pending}
            onClick={() => confirm(`Unlink ${p.full_name}? Shared projects keep their members.`) && run(() => unlinkSupervision({ otherId: p.id }))}
          >
            <Unlink /> Unlink
          </Button>
        </li>
      ))}
    </ul>
  );
}
