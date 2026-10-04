// Demo data: the world the interface spec is drawn in. Prof. Anita Mehta
// supervises six students across five power electronics projects; Riya Gupta
// is mid-way through "GaN boost converter for solar MPPT" with a change request
// open, a task in review, two overdue items and twelve weeks of progress logs.
//
//   npm run seed              (first run)
//   npm run seed -- --reset   (delete the demo accounts and their projects, then seed again)
//
// Reads .env.local and needs SUPABASE_SECRET_KEY, which bypasses RLS: run it
// only against a development project. Every date is relative to today, so the
// demo always looks live. Only accounts on @researchflow.demo are touched.

import { createClient } from "@supabase/supabase-js";
import { addDays, todayIn, weekStartOf, type ISODate } from "../src/lib/domain/dates.ts";
import { buildWeeklyReport } from "../src/lib/domain/weekly-report.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const PASSWORD = "researchflow-demo";
const DOMAIN = "@researchflow.demo";
const TZ = "Asia/Kolkata";
const today = todayIn(TZ);
const day = (n: number): ISODate => addDays(today, n);
/** An instant on a day relative to today, at a local (IST) wall-clock time. */
const at = (n: number, time = "19:00") => new Date(`${day(n)}T${time}:00+05:30`).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function check<T>(label: string, result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) {
    console.error(`✗ ${label}: ${result.error.message}`);
    process.exit(1);
  }
  return result.data as NonNullable<T>;
}

// ───────────────────────────── reset ─────────────────────────────

async function demoUsers() {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.filter((u) => u.email?.endsWith(DOMAIN));
}

if (process.argv.includes("--reset")) {
  const demo = await demoUsers();
  const ids = new Set(demo.map((u) => u.id));
  if (ids.size > 0) {
    const members = check("members", await db.from("project_members").select("project_id, user_id"));
    const byProject = new Map<string, string[]>();
    for (const m of members) byProject.set(m.project_id, [...(byProject.get(m.project_id) ?? []), m.user_id]);
    const projects = check("projects", await db.from("projects").select("id, title, created_by"));
    const doomed: string[] = [];
    for (const p of projects) {
      const people = byProject.get(p.id) ?? [];
      const demoOwned = ids.has(p.created_by);
      const allDemo = people.every((u) => ids.has(u));
      if (demoOwned && allDemo) doomed.push(p.id);
      else if (demoOwned || people.some((u) => ids.has(u))) {
        console.error(`✗ "${p.title}" mixes demo accounts with real ones. Remove the demo members from it first; nothing was deleted.`);
        process.exit(1);
      }
    }
    if (doomed.length) check("delete projects", await db.from("projects").delete().in("id", doomed));
    for (const u of demo) {
      const { error } = await db.auth.admin.deleteUser(u.id);
      if (error) {
        console.error(`✗ Deleting ${u.email}: ${error.message}`);
        process.exit(1);
      }
    }
    console.log(`✓ reset: removed ${demo.length} demo accounts and ${doomed.length} projects`);
  }
}

// ───────────────────────────── people ─────────────────────────────

async function user(handle: string, full_name: string, role: "student" | "professor") {
  const email = `${handle}${DOMAIN}`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name, role, timezone: TZ },
  });
  if (error) {
    console.error(`✗ Creating ${email}: ${error.message}${error.code === "email_exists" ? ". The demo already exists; run `npm run seed -- --reset` to rebuild it." : ""}`);
    process.exit(1);
  }
  return data.user.id;
}

const prof = await user("prof.mehta", "Prof. Anita Mehta", "professor");
const riya = await user("riya", "Riya Gupta", "student");
const arjun = await user("arjun", "Arjun Singh", "student");
const meera = await user("meera", "Meera Iyer", "student");
const dev = await user("dev", "Dev Patel", "student");
const kabir = await user("kabir", "Kabir Shah", "student");
const ananya = await user("ananya", "Ananya Rao", "student");
const students = [riya, arjun, meera, dev, kabir, ananya];
// Settled accounts, three months in: no welcome flow, checklist or "New" pills.
// (Before the onboarding migration the column doesn't exist; skip quietly then.)
await db.from("profiles").update({ onboarding: { setup: "skipped", legacy: true }, created_at: at(-90, "09:00") }).in("id", [prof, ...students]);
check("supervisions", await db.from("supervisions").insert(students.map((s) => ({ professor_id: prof, student_id: s, created_at: at(-90, "10:00") }))));
console.log("✓ 7 people");

// ───────────────────────────── projects ─────────────────────────────

type MilestoneSeed = { title: string; due: number };
async function project(p: { title: string; description: string; start: number; end: number; by: string; members: string[]; milestones: MilestoneSeed[] }) {
  const row = check(
    `project ${p.title}`,
    await db
      .from("projects")
      .insert({ title: p.title, description: p.description, start_date: day(p.start), target_end_date: day(p.end), created_by: p.by, created_at: at(p.start, "11:00") })
      .select("id")
      .single(),
  );
  check("members", await db.from("project_members").insert([
    { project_id: row.id, user_id: prof, role: "professor" as const, added_at: at(p.start, "11:05") },
    ...p.members.map((u) => ({ project_id: row.id, user_id: u, role: "student" as const, added_at: at(p.start, "11:05") })),
  ]));
  const ms = check(
    "milestones",
    await db
      .from("milestones")
      .insert(p.milestones.map((m, i) => ({ project_id: row.id, title: m.title, due_date: day(m.due), position: i, created_by: prof, created_at: at(p.start, "11:10") })))
      .select("id, title"),
  );
  return { id: row.id, milestone: (title: string) => ms.find((m) => m.title === title)!.id };
}

const boost = await project({
  title: "GaN boost converter for solar MPPT",
  description:
    "Can a 1 kW GaN boost converter switching at 200 kHz reach 98% peak efficiency while its MPPT tracks within 1% of the panel's maximum power? Target: a conference paper by the end of November.",
  start: -80,
  end: 53,
  by: riya,
  members: [riya, arjun],
  milestones: [
    { title: "Simulation model", due: -13 },
    { title: "Hardware prototype", due: 2 },
    { title: "Conference paper draft", due: 35 },
  ],
});
const review = await project({
  title: "Review of GaN and SiC losses in DC-DC converters",
  description: "A review of switching, conduction and gate-drive losses in wide-bandgap devices for 1–10 kW DC-DC converters, organised by where the losses go.",
  start: -30,
  end: 75,
  by: dev,
  members: [dev, riya],
  milestones: [
    { title: "Review §2 outline", due: -4 },
    { title: "Review first draft", due: 16 },
  ],
});
const inverter = await project({
  title: "Three-phase inverter for a PMSM drive",
  description: "Does space-vector PWM with dead-time compensation bring phase-current THD below 3% in a 2 kW, 400 V inverter driving a PMSM?",
  start: -60,
  end: 60,
  by: meera,
  members: [meera],
  milestones: [
    { title: "Inverter hardware", due: -5 },
    { title: "Closed-loop control", due: 20 },
  ],
});
const wpt = await project({
  title: "Wireless charging coils for e-bikes",
  description: "Coil geometries for a 300 W inductive charger at 85 kHz with a 10 cm air gap: coupling, misalignment tolerance and losses.",
  start: -70,
  end: 40,
  by: kabir,
  members: [kabir],
  milestones: [
    { title: "Coil design", due: 9 },
    { title: "Full draft", due: 35 },
  ],
});
const llc = await project({
  title: "LLC resonant converter efficiency benchmark",
  description: "A repeatable test bench and open dataset for LLC converter efficiency across load and input voltage, with calibrated measurements.",
  start: -85,
  end: 20,
  by: ananya,
  members: [ananya],
  milestones: [
    { title: "Test bench", due: -30 },
    { title: "Measurements and baselines", due: 5 },
    { title: "Paper", due: 20 },
  ],
});
console.log("✓ 5 projects");

// ───────────────────────────── tasks ─────────────────────────────

type Status = "todo" | "in_progress" | "in_review" | "changes_requested" | "done";
type TaskSeed = {
  key: string;
  project: { id: string; milestone: (t: string) => string };
  milestone?: string;
  title: string;
  assignee: string;
  prof?: number;
  mine?: number;
  status: Status;
  priority?: "low" | "medium" | "high" | "urgent";
  estimate?: number;
  description?: string;
  created: number;
  /** When it went to review (days ago, or hours ago with `submittedHours`). */
  submitted?: number;
  submittedHours?: number;
  completed?: number;
};

const T: TaskSeed[] = [
  // GaN boost converter: Riya
  { key: "litreview", project: boost, milestone: "Simulation model", title: "Literature review on GaN boost converters for PV", assignee: riya, prof: -62, status: "done", created: -80, completed: -63, estimate: 12 },
  { key: "simmodel", project: boost, milestone: "Simulation model", title: "Build the PLECS model of the boost stage", assignee: riya, prof: -45, status: "done", created: -70, completed: -46, estimate: 8 },
  { key: "simvalid", project: boost, milestone: "Simulation model", title: "Validate simulated losses against the hand calculation", assignee: riya, prof: -13, status: "done", created: -40, completed: -11, estimate: 6 },
  { key: "deadtime", project: boost, milestone: "Simulation model", title: "Fix dead-time error in the PWM signals", assignee: riya, prof: -12, status: "done", priority: "high", created: -14, completed: -12 },
  { key: "gatedriver", project: boost, milestone: "Hardware prototype", title: "Design the GaN gate-driver PCB", assignee: riya, prof: 1, mine: 0, status: "in_review", priority: "high", estimate: 10, created: -20, submitted: 1,
    description: "Isolated gate driver for the GaN half-bridge with a Kelvin source connection and a gate loop under 5 nH. Done when the double-pulse test at 400 V shows under 20% overshoot." },
  { key: "effsweep", project: boost, milestone: "Hardware prototype", title: "Measure efficiency from 25% to 100% load", assignee: riya, prof: 4, mine: 2, status: "in_progress", priority: "high", estimate: 12, created: -10, submitted: 3,
    description: "Efficiency at 25, 50, 75 and 100% load at 200 kHz with the power analyser, at 30 V and 40 V input. Done when efficiency curve v3 is in the Overleaf draft." },
  { key: "scatter", project: boost, milestone: "Hardware prototype", title: "Fix efficiency scatter at full load", assignee: riya, prof: -1, status: "in_progress", priority: "high", estimate: 4, created: -4 },
  { key: "revise", project: boost, milestone: "Hardware prototype", title: "Revise efficiency curve with light-load points", assignee: riya, prof: 0, status: "in_progress", priority: "high", estimate: 3, created: -2 },
  { key: "heatsink", project: boost, milestone: "Hardware prototype", title: "Retry full-load test with the larger heatsink", assignee: riya, mine: 0, status: "in_progress", priority: "medium", estimate: 2.5, created: -4 },
  { key: "lightload", project: boost, milestone: "Hardware prototype", title: "Add light-load points (5% and 10%)", assignee: riya, mine: 1, status: "todo", priority: "high", estimate: 4, created: -2,
    description: "Measure at 5% and 10% load, 3 repeats per point, and mark where the inductor current goes discontinuous." },
  { key: "system", project: boost, milestone: "Hardware prototype", title: "Full-system test: MPPT on the hardware prototype", assignee: riya, prof: 3, status: "todo", estimate: 6, created: -9 },
  { key: "outline", project: boost, milestone: "Conference paper draft", title: "Outline the converter design section", assignee: riya, mine: 4, status: "todo", priority: "low", created: -6 },
  { key: "plot", project: boost, milestone: "Conference paper draft", title: "Plot efficiency vs. load curves", assignee: riya, prof: 10, mine: 8, status: "todo", created: -10 },
  { key: "design", project: boost, milestone: "Conference paper draft", title: "Write the converter design section", assignee: riya, prof: 18, status: "todo", created: -10 },
  { key: "figures", project: boost, milestone: "Conference paper draft", title: "Final efficiency and waveform figures", assignee: riya, prof: 24, status: "todo", created: -10 },
  { key: "draft", project: boost, milestone: "Conference paper draft", title: "Conference draft to Prof. Mehta", assignee: riya, prof: 29, status: "todo", priority: "high", created: -10 },
  // GaN boost converter: Arjun
  { key: "mppt", project: boost, milestone: "Simulation model", title: "Perturb-and-observe MPPT in simulation", assignee: arjun, prof: -13, status: "done", estimate: 8, created: -40, completed: -14 },
  { key: "irradiance", project: boost, milestone: "Hardware prototype", title: "Test MPPT under fast irradiance steps", assignee: arjun, prof: -1, status: "in_progress", estimate: 6, created: -15 },
  { key: "dsp", project: boost, milestone: "Conference paper draft", title: "Port the MPPT to the C2000 controller", assignee: arjun, prof: 12, status: "todo", created: -15 },
  // Loss review: Riya and Dev
  { key: "papers", project: review, milestone: "Review §2 outline", title: "Collect 40 core papers", assignee: dev, prof: -12, status: "done", created: -30, completed: -13 },
  { key: "s2outline", project: review, milestone: "Review §2 outline", title: "Review §2 outline", assignee: riya, prof: -4, status: "done", created: -20, completed: -4 },
  { key: "rdson", project: review, milestone: "Review first draft", title: "Read 3 papers on GaN dynamic on-resistance", assignee: riya, mine: -2, status: "todo", created: -8 },
  { key: "switching", project: review, milestone: "Review first draft", title: "Draft the switching-loss section", assignee: riya, prof: 12, mine: 5, status: "in_progress", estimate: 10, created: -12 },
  { key: "s2full", project: review, milestone: "Review first draft", title: "Review §2 full draft", assignee: riya, prof: 13, status: "todo", created: -4 },
  { key: "losstable", project: review, milestone: "Review first draft", title: "Loss breakdown table: GaN vs. SiC", assignee: dev, prof: 6, status: "in_progress", estimate: 8, created: -12 },
  // Meera
  { key: "powerstage", project: inverter, milestone: "Inverter hardware", title: "Build the three-phase power stage", assignee: meera, prof: -30, status: "done", created: -55, completed: -31 },
  { key: "svpwm", project: inverter, milestone: "Inverter hardware", title: "Implement SVPWM on the controller", assignee: meera, prof: -3, status: "in_progress", priority: "high", estimate: 10, created: -20 },
  { key: "deadcomp", project: inverter, milestone: "Inverter hardware", title: "Dead-time compensation study", assignee: meera, prof: -1, status: "todo", created: -15 },
  { key: "foc", project: inverter, milestone: "Closed-loop control", title: "Closed-loop FOC tests on the PMSM", assignee: meera, prof: 14, status: "todo", created: -15 },
  // Kabir
  { key: "coilsearch", project: wpt, milestone: "Coil design", title: "Literature search on charging coil geometries", assignee: kabir, prof: -40, status: "done", created: -65, completed: -42 },
  { key: "fem", project: wpt, milestone: "Coil design", title: "FEM models of 6 coil geometries", assignee: kabir, prof: -10, status: "done", created: -50, completed: -11 },
  { key: "coupling", project: wpt, milestone: "Coil design", title: "Coupling-factor comparison table", assignee: kabir, prof: 9, status: "in_review", created: -10, submittedHours: 2 },
  { key: "wptintro", project: wpt, milestone: "Full draft", title: "Write the introduction", assignee: kabir, prof: 20, status: "todo", created: -10 },
  // Ananya
  { key: "bench", project: llc, milestone: "Test bench", title: "Build the 500 W LLC test bench", assignee: ananya, prof: -32, status: "done", created: -80, completed: -33 },
  { key: "calibrate", project: llc, milestone: "Test bench", title: "Calibrate the power analyser and shunts", assignee: ananya, prof: -28, status: "done", created: -70, completed: -29 },
  { key: "protocol1", project: llc, milestone: "Measurements and baselines", title: "Measurement protocol v1", assignee: ananya, prof: -15, status: "done", created: -40, completed: -16 },
  { key: "reference", project: llc, milestone: "Measurements and baselines", title: "Measure the Si and GaN reference designs", assignee: ananya, prof: -6, status: "done", created: -30, completed: -7 },
  { key: "protocol2", project: llc, milestone: "Measurements and baselines", title: "Measurement protocol v2 (thermal steady state)", assignee: ananya, prof: 4, status: "in_review", created: -12, submittedHours: 6 },
  { key: "llcpaper", project: llc, milestone: "Paper", title: "Write the benchmark paper", assignee: ananya, prof: 18, status: "todo", created: -12 },
];

const inserted = check(
  "tasks",
  await db
    .from("tasks")
    .insert(
      T.map((s, i) => ({
        project_id: s.project.id,
        milestone_id: s.milestone ? s.project.milestone(s.milestone) : null,
        title: s.title,
        description: s.description ?? "",
        assignee_id: s.assignee,
        professor_deadline: s.prof === undefined ? null : day(s.prof),
        personal_deadline: s.mine === undefined ? null : day(s.mine),
        priority: s.priority ?? "medium",
        estimate_hours: s.estimate ?? null,
        created_by: prof,
        created_at: at(s.created, "10:30"),
        position: i,
      })),
    )
    .select("id, title, project_id"),
);
const task = (k: string) => inserted[T.findIndex((t) => t.key === k)].id;

// Walk statuses forward the way people would have, then put the real times
// back: the trigger stamps submitted_at and completed_at with now(), and keeps
// whatever a later update sets once the status has settled.
for (const s of T) {
  const id = task(s.key);
  const go = async (status: Status) => check(`${s.key} → ${status}`, await db.from("tasks").update({ status }).eq("id", id));
  if (s.status === "todo") continue;
  await go("in_progress");
  if (s.key === "effsweep") {
    await go("in_review");
    await go("changes_requested");
    await go("in_progress");
  } else if (s.status === "in_review" || (s.status === "done" && students.includes(s.assignee))) {
    await go("in_review");
    if (s.status === "done") await go("done");
  }
  const stamps: { submitted_at?: string; completed_at?: string } = {};
  if (s.submitted !== undefined) stamps.submitted_at = at(-s.submitted, "17:40");
  if (s.submittedHours !== undefined) stamps.submitted_at = hoursAgo(s.submittedHours);
  if (s.completed !== undefined) {
    stamps.completed_at = at(s.completed, "16:20");
    stamps.submitted_at ??= at(s.completed - 1, "18:10");
  }
  if (Object.keys(stamps).length) check(`${s.key} times`, await db.from("tasks").update(stamps).eq("id", id));
}

check("dependencies", await db.from("task_dependencies").insert([
  { task_id: task("effsweep"), depends_on_id: task("lightload") },
  { task_id: task("plot"), depends_on_id: task("effsweep") },
  { task_id: task("system"), depends_on_id: task("irradiance") },
  { task_id: task("design"), depends_on_id: task("gatedriver") },
  { task_id: task("figures"), depends_on_id: task("plot") },
]));

// Deadline history: one extension granted by the professor, one slip of Riya's own target.
check("deadline history", await db.from("deadline_changes").insert([
  { task_id: task("effsweep"), project_id: boost.id, field: "professor", old_value: day(-1), new_value: day(4), changed_by: prof, changed_at: at(-2, "11:15") },
  { task_id: task("effsweep"), project_id: boost.id, field: "personal", old_value: day(-2), new_value: day(2), changed_by: riya, changed_at: at(-2, "21:05") },
  { task_id: task("switching"), project_id: review.id, field: "personal", old_value: day(2), new_value: day(5), changed_by: riya, changed_at: at(-3, "09:40") },
]));
console.log(`✓ ${T.length} tasks`);

// ───────────────────────────── progress logs ─────────────────────────────

type LogSeed = { who: string; project: string; d: number; done: string; problems?: string; next?: string; min: number; tasks: string[]; writtenLate?: number };

// The last two weeks are written out; earlier weeks come from a small,
// deterministic generator so the consistency heatmap has twelve weeks of shape.
const recent: LogSeed[] = [
  // Riya, two weeks ago
  { who: riya, project: boost.id, d: -12, done: "Found the dead-time error: the complementary PWM had 20 ns instead of 50 ns, so both switches overlapped. Fixed; the shoot-through spikes are gone.", problems: "Lost half a day to it.", next: "Start the gate-driver schematic.", min: 300, tasks: ["deadtime"] },
  { who: riya, project: boost.id, d: -11, done: "Re-ran the simulation with the corrected dead time: 14.2 W total loss vs. 14.6 W by hand. Closed the validation.", next: "Gate-driver PCB.", min: 210, tasks: ["simvalid"] },
  { who: riya, project: boost.id, d: -9, done: "Gate-driver schematic done: isolated driver, Kelvin source, 10 Ω turn-on and 2 Ω turn-off resistors.", problems: "Simulated gate ringing shows 30% overshoot.", next: "Shorten the gate loop in the layout.", min: 240, tasks: ["gatedriver"] },
  { who: riya, project: boost.id, d: -8, done: "Layout with the gate loop under 4 nH; simulated overshoot down to 15%.", next: "Order the board and run the double-pulse test.", min: 270, tasks: ["gatedriver"] },
  { who: riya, project: review.id, d: -8, done: "Sorted 40 papers into four loss categories for §2.", next: "Write the §2 outline.", min: 60, tasks: ["s2outline"] },
  { who: riya, project: boost.id, d: -6, done: "Double-pulse test at 400 V: 18% overshoot, 6 ns turn-on.", problems: "The board runs hotter than expected at 200 kHz.", next: "Check the copper and vias around the switching node.", min: 330, tasks: ["gatedriver"], writtenLate: 1 },
  // Riya, last week
  { who: riya, project: boost.id, d: -5, done: "Found the hot spot: no thermal vias under the GaN FET. Added vias and a heatsink pad; 20 °C cooler.", next: "Start the efficiency measurements.", min: 180, tasks: ["gatedriver"] },
  { who: riya, project: boost.id, d: -4, done: "Efficiency at 25–100% load measured at 40 V input: peak 97.6% at 50% load.", problems: "The GaN FET reached 105 °C at full load.", next: "Retry full load with the larger heatsink.", min: 290, tasks: ["effsweep"], writtenLate: 1 },
  { who: riya, project: review.id, d: -4, done: "Review §2 outline finished: switching, conduction, gate-drive and magnetics losses.", next: "Draft the switching-loss section from the outline.", min: 75, tasks: ["s2outline", "switching"] },
  { who: riya, project: boost.id, d: -2, done: "Efficiency curve v1 drafted; sent for review.", problems: "Full-load points scatter by ±0.4%.", next: "More repeats at full load.", min: 230, tasks: ["effsweep", "scatter"] },
  { who: riya, project: boost.id, d: -1, done: "Gate-driver PCB submitted for review with the double-pulse waveforms. Started 2 extra repeats at full load.", problems: "Light-load points not measured yet.", next: "Retry full-load test with the larger heatsink", min: 200, tasks: ["gatedriver", "scatter"] },
  { who: riya, project: review.id, d: -1, done: "Switching-loss section: first two paragraphs on GaN turn-on losses.", next: "Read the dynamic on-resistance papers.", min: 90, tasks: ["switching"] },
  // Arjun: quiet for five days
  { who: arjun, project: boost.id, d: -12, done: "Set up the irradiance-step profiles on the PV emulator.", problems: "The emulator is booked most of the week.", next: "Run the 1000 → 200 W/m² step.", min: 150, tasks: ["irradiance"] },
  { who: arjun, project: boost.id, d: -8, done: "P&O on a slow irradiance ramp: 99.1% tracking efficiency.", next: "Fast steps.", min: 140, tasks: ["irradiance"] },
  { who: arjun, project: boost.id, d: -5, done: "First fast step, 1000 → 200 W/m²: P&O settles in 0.4 s but oscillates around the MPP.", problems: "The PV emulator is booked out after this run.", next: "Ask about another emulator slot.", min: 120, tasks: ["irradiance"] },
  // Meera: last log two days ago
  { who: meera, project: inverter.id, d: -6, done: "SVPWM running open loop at 20 Hz on an R-L load; phase currents balanced.", problems: "Not sure whether 400 V bus tests need a second person in the lab.", next: "Raise the DC bus to 200 V.", min: 260, tasks: ["svpwm"] },
  { who: meera, project: inverter.id, d: -4, done: "Ran at 200 V DC bus: current THD 4.8% at 2 A.", next: "Go to 400 V.", min: 240, tasks: ["svpwm"] },
  { who: meera, project: inverter.id, d: -2, done: "400 V run reached 1 kW before the gate driver tripped on desaturation.", problems: "One desat trip, probably noise on the sense line.", next: "Filter the desat pin and retry.", min: 150, tasks: ["svpwm"] },
  // Dev: last log three days ago
  { who: dev, project: review.id, d: -7, done: "Drafted the loss table columns: switching, conduction, gate-drive and reverse-recovery losses.", next: "Place the 40 papers in the table.", min: 180, tasks: ["losstable"] },
  { who: dev, project: review.id, d: -5, done: "Placed 25 of 40 papers.", next: "Finish placing; discuss gaps with Riya.", min: 140, tasks: ["losstable"] },
  { who: dev, project: review.id, d: -3, done: "Placed all 40; 3 papers report losses at different junction temperatures.", problems: "We may need to normalise everything to 100 °C.", next: "Decide on the normalisation.", min: 120, tasks: ["losstable"] },
  // Kabir: steady
  ...[-5, -4, -3, -2, -1, 0].map((d, i) => ({
    who: kabir, project: wpt.id, d, min: [110, 95, 120, 100, 85, 80][i], tasks: ["coupling"],
    done: ["Circular coil: k = 0.21 at a 10 cm gap.", "DD coil: k = 0.27, and it tolerates 4 cm of misalignment.", "Comparison table draft complete.", "Re-ran two geometries with a finer mesh.", "Added misalignment and coil-loss columns.", "Submitted the coupling-factor table for review."][i],
    next: ["Simulate the DD coil.", "Finish the remaining geometries.", "Check mesh convergence.", "Add misalignment columns.", "Submit for review.", "Start the introduction."][i],
  })),
  // Ananya: steady, ahead of plan
  ...[-6, -5, -4, -3, -2, -1, 0].map((d, i) => ({
    who: ananya, project: llc.id, d, min: [150, 130, 120, 140, 110, 90, 100][i], tasks: [i < 2 ? "reference" : "protocol2"],
    done: ["Si reference design measured at 8 load points.", "GaN reference design measured; within 0.3% of the application note.", "Protocol v2: wait for thermal steady state before each reading.", "Repeatability check passes: ±0.1% across 3 days.", "Re-measured both designs with protocol v2.", "Wrote the protocol README.", "Submitted protocol v2 for review."][i],
    next: ["Measure the GaN design.", "Start protocol v2.", "Check repeatability.", "Re-measure both designs.", "Document the protocol.", "Submit.", "Start the paper outline."][i],
  })),
];

// Older weeks: Riya logs most weekdays and some weekends.
const older: LogSeed[] = [];
let seed = 7;
const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const riyaOld = [
  { from: -80, to: -63, task: "litreview",
    done: ["Read and summarised 3 GaN boost converter papers.", "Annotated the GaN half-bridge application note.", "Compared hard- and soft-switching boost designs in 4 papers.", "Wrote a one-page summary of MPPT algorithms.", "Read the interleaved boost converter papers.", "Listed open questions for the meeting."],
    next: ["Read the GaN gate-drive papers.", "Summarise the loss models.", "Pick a starting switching frequency.", "Ask Prof. Mehta which conference to aim for."],
    problems: ["Two papers report different efficiency for nearly the same design.", "", "", ""] },
  { from: -62, to: -46, task: "simmodel",
    done: ["Boost stage in PLECS with ideal switches.", "Added the GaN FET loss tables from the datasheet.", "Inductor core-loss model (Steinmetz).", "PV array model feeding the boost input.", "Sweep script for switching frequency."],
    next: ["Add device losses.", "Add the inductor model.", "Sweep switching frequency.", "Start validating against the hand calculation."],
    problems: ["Simulation step was too large; the ripple looked wrong.", "", "", "No core-loss data above 300 kHz."] },
  { from: -45, to: -13, task: "simvalid",
    done: ["Compared simulated losses to the hand calculation.", "Swept switching frequency from 100 to 300 kHz.", "Matched inductor ripple to the hand calculation.", "Loss estimate 15.4 W; 0.8 W above the hand calculation.", "Added gate-charge losses: 15.0 W."],
    next: ["Check the dead time against the datasheet.", "Sweep dead time from 20 to 80 ns.", "Add reverse-conduction losses.", "Look for a timing error in the PWM."],
    problems: ["Still 0.8 W above the hand calculation.", "", "Ripple differs by 10% at light load.", ""] },
];
for (const phase of riyaOld) {
  for (let d = phase.from; d <= phase.to; d++) {
    if (d >= -12) break;
    const weekend = [6, 7].includes(new Date(`${day(d)}T12:00:00Z`).getUTCDay() || 7);
    if (rand() > (weekend ? 0.25 : 0.75)) continue;
    const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
    older.push({
      who: riya, project: boost.id, d, tasks: [phase.task],
      done: pick(phase.done),
      problems: pick(phase.problems),
      next: pick(phase.next),
      min: 60 + Math.round(rand() * 6) * 30,
    });
  }
}
for (let d = -40; d <= -14; d++) {
  if (rand() > 0.45) continue;
  const arjunDone = ["P&O MPPT running in simulation.", "Tuned the P&O step size.", "Tracking efficiency 98.4%; checking the sampling rate.", "Sampling at 10 Hz: 99.0% tracking efficiency."];
  older.push({ who: arjun, project: boost.id, d, tasks: ["mppt"], done: arjunDone[Math.floor(rand() * arjunDone.length)], next: "Keep tuning the MPPT.", min: 90 + Math.round(rand() * 4) * 30 });
}

const logIds = new Map<string, string>();
for (const l of [...older, ...recent]) {
  const row = check(
    "log",
    await db
      .from("progress_logs")
      .insert({
        project_id: l.project,
        author_id: l.who,
        log_date: day(l.d),
        completed_work: l.done,
        problems: l.problems ?? "",
        next_steps: l.next ?? "",
        minutes_spent: l.min,
        created_at: at(l.d + (l.writtenLate ?? 0), l.writtenLate ? "09:30" : "19:30"),
        updated_at: at(l.d + (l.writtenLate ?? 0), l.writtenLate ? "09:30" : "19:30"),
      })
      .select("id")
      .single(),
  );
  logIds.set(`${l.who}:${l.project}:${l.d}`, row.id);
  check("log tasks", await db.from("progress_log_tasks").insert(l.tasks.map((t) => ({ log_id: row.id, task_id: task(t) }))));
}
console.log(`✓ ${older.length + recent.length} progress logs`);

check("attachments", await db.from("attachments").insert([
  { project_id: boost.id, uploader_id: riya, kind: "link", name: "Gate-driver PCB, rev B (KiCad)", url: "https://github.com/riya/gan-boost/pull/14", task_id: task("gatedriver"), created_at: at(-1, "17:35") },
  { project_id: boost.id, uploader_id: riya, kind: "link", name: "Efficiency curve v1 (Overleaf)", url: "https://www.overleaf.com/project/demo", task_id: task("effsweep"), created_at: at(-2, "18:50") },
  { project_id: boost.id, uploader_id: riya, kind: "link", name: "Thermal image at full load, small heatsink", url: "https://drive.google.com/file/d/demo-thermal", task_id: task("heatsink"), created_at: at(-4, "20:10") },
  { project_id: wpt.id, uploader_id: kabir, kind: "link", name: "Coupling-factor table (Google Sheets)", url: "https://docs.google.com/spreadsheets/d/demo", task_id: task("coupling"), created_at: hoursAgo(2) },
  { project_id: llc.id, uploader_id: ananya, kind: "link", name: "Protocol v2 README", url: "https://github.com/ananya/llc-bench/blob/main/PROTOCOL.md", task_id: task("protocol2"), created_at: hoursAgo(6) },
]));

// ───────────────────────────── remarks, blockers, decisions ─────────────────────────────

const remarks = check(
  "remarks",
  await db
    .from("remarks")
    .insert([
      { project_id: boost.id, task_id: task("effsweep"), author_id: prof, kind: "change_request" as const, created_at: at(-2, "10:40"),
        body: "Good start. Before I approve: add the light-load points (5% and 10%), and repeat every point 3 times." },
      { project_id: boost.id, author_id: prof, kind: "question" as const, created_at: at(-1, "12:15"),
        body: "Which conference are we targeting? The page limit changes how much of the efficiency data goes in the main text." },
      { project_id: boost.id, task_id: task("simvalid"), author_id: prof, kind: "approval" as const, created_at: at(-11, "18:00"), body: "Matches the hand calculation. Approved." },
      { project_id: boost.id, task_id: task("scatter"), author_id: prof, kind: "comment" as const, created_at: at(-1, "21:10"),
        body: "Is the scatter from thermal drift or from the current probe? Check before adding more repeats." },
      { project_id: inverter.id, task_id: task("svpwm"), author_id: prof, kind: "comment" as const, created_at: at(-3, "15:00"),
        body: "Keep a 48 V run as a sanity check alongside the 400 V tests." },
    ])
    .select("id, kind, task_id"),
);
const changeRequest = remarks[0].id;
// The follow-up tasks Riya made from the change request.
check("follow-ups", await db.from("tasks").update({ source_remark_id: changeRequest }).in("id", [task("lightload"), task("revise")]));
// The approval was acted on long ago.
check("addressed", await db.from("remarks").update({ addressed_at: at(-11, "18:30") }).eq("id", remarks[2].id));

const blockers = check(
  "blockers",
  await db
    .from("blockers")
    .insert([
      { project_id: boost.id, task_id: task("irradiance"), raised_by: arjun, severity: "high" as const, needs_professor: true, created_at: at(-5, "18:40"),
        title: "PV emulator booked out for two weeks",
        description: "The drives group has the lab's PV emulator booked. Need either a slot swap or access to the one in the power systems lab." },
      { project_id: inverter.id, raised_by: meera, severity: "medium" as const, needs_professor: true, created_at: at(-2, "16:00"),
        title: "Safety approval for 400 V bus tests unclear",
        description: "The lab safety sheet doesn't say whether 400 V DC bus tests need a second person present. Can the department confirm?" },
      { project_id: wpt.id, raised_by: kabir, severity: "low" as const, needs_professor: false, created_at: at(-3, "11:00"),
        title: "Litz wire order delayed",
        description: "Purchase order sent; the supplier says 10 days." },
      { project_id: boost.id, task_id: task("heatsink"), raised_by: riya, severity: "medium" as const, needs_professor: false, created_at: at(-4, "20:15"),
        title: "GaN FET overheating at full load",
        description: "Reached 105 °C at 1 kW with the small heatsink." },
    ])
    .select("id"),
);
check("resolve", await db.from("blockers").update({ status: "resolved", resolution: "The larger heatsink with a 40 mm fan holds it at 78 °C." }).eq("id", blockers[3].id));
check("resolve time", await db.from("blockers").update({ resolved_at: at(-2, "12:00") }).eq("id", blockers[3].id));

check("decisions", await db.from("decisions").insert([
  { project_id: boost.id, author_id: riya, decided_on: day(-30), created_at: at(-30, "17:00"),
    title: "Use GaN FETs, not silicon MOSFETs",
    context: "At 200 kHz, a silicon MOSFET's switching losses alone would cost about 1.5 points of efficiency.",
    decision: "Use 650 V GaN FETs with an isolated gate driver; keep the silicon design only as a comparison.",
    alternatives: "Silicon superjunction MOSFET (kept as a comparison baseline); SiC MOSFET (deferred: cost)." },
  { project_id: boost.id, author_id: riya, decided_on: day(-4), created_at: at(-4, "20:20"),
    title: "Use the larger heatsink with forced air for full-load tests",
    context: "The GaN FET reached 105 °C at 1 kW with the small heatsink.",
    decision: "All full-load tests use the larger heatsink and a 40 mm fan; readings are taken after 10 minutes at steady state.",
    alternatives: "Drop the switching frequency to 150 kHz (kept as a fallback)." },
]));

// Arjun asked for more time on the irradiance tests (only if the extension
// requests migration has been applied).
const ext = await db.from("extension_requests").insert({
  task_id: task("irradiance"), project_id: boost.id, requested_by: arjun, current_deadline: day(-1), proposed_deadline: day(6),
  reason: "The PV emulator was booked out after my first fast-step run; it's free again next week.", created_at: at(-1, "09:20"),
});
console.log(`✓ remarks, blockers, decisions${ext.error ? " (extension requests skipped: apply migration 20261004000006 first)" : ", an extension request"}`);

// ───────────────────────────── meetings ─────────────────────────────
// Last week's one-to-one with Riya (ended, with notes and three action items),
// and two coming up. Skipped until migration 11 has created the table.
// (Every row names every column: a bulk insert sends null for missing ones.)

const meetingRows = await db
  .from("meetings")
  .insert([
    { professor_id: prof, student_id: riya, starts_at: at(-7, "16:00"), created_by: prof, created_at: at(-9, "10:00"),
      notes: "Gate driver: overshoot target is under 20% at 400 V; Riya's layout gets 18%, good enough to move on.\nThermal: the small heatsink won't do full load. Try the larger one with a fan before changing the frequency.\nPaper: aim for ECCE if the efficiency curve is done by the end of the month, otherwise APEC.\nArjun needs a PV emulator slot; Prof. Mehta to ask the drives group." },
    { professor_id: prof, student_id: riya, starts_at: at(1, "16:00"), created_by: prof, created_at: at(-1, "18:30"), notes: "" },
    { professor_id: prof, student_id: arjun, starts_at: at(3, "11:30"), created_by: arjun, created_at: at(-1, "09:30"), notes: "" },
  ])
  .select("id");
if (meetingRows.error) {
  console.log(`✓ meetings skipped (${meetingRows.error.message}; apply migration 20261009000011 first if the table is missing)`);
} else {
  const [last, nextRiya] = meetingRows.data;
  check("meeting done", await db.from("meetings").update({ status: "done" }).eq("id", last.id));
  // The trigger stamps the real end time; put last week's back.
  check("meeting ended at", await db.from("meetings").update({ ended_at: at(-7, "16:45") }).eq("id", last.id));
  check("action items", await db.from("tasks").update({ meeting_id: last.id }).in("id", [task("heatsink"), task("scatter"), task("outline")]));
  check("topics", await db.from("meeting_topics").insert([
    { meeting_id: nextRiya.id, author_id: riya, body: "ECCE or APEC? The page limits change how much efficiency data fits.", created_at: at(-1, "20:10") },
    { meeting_id: nextRiya.id, author_id: prof, body: "Show the double-pulse waveforms at 400 V.", created_at: at(-1, "18:35") },
  ]));
  console.log("✓ 3 meetings");
}

// ───────────────────────────── weekly reports ─────────────────────────────
// Last week's reports are submitted (Riya's is acknowledged); this week's are
// left to be generated live.

const lastWeek = addDays(weekStartOf(today), -7);
async function submitReport(student: string, note: string, acknowledged: boolean, submittedOn: number) {
  const weekEnd = addDays(lastWeek, 6);
  const mine = check("my projects", await db.from("project_members").select("project_id").eq("user_id", student)).map((m) => m.project_id);
  const [projects, tasks, logs, blockerRows, decisions, remarkRows] = await Promise.all([
    db.from("projects").select("id, title").in("id", mine),
    db.from("tasks").select("id, title, project_id, status, professor_deadline, personal_deadline, effective_deadline, completed_at, created_at").eq("assignee_id", student),
    db.from("progress_logs").select("project_id, log_date, completed_work, problems, next_steps, minutes_spent").eq("author_id", student).gte("log_date", addDays(lastWeek, -28)).lte("log_date", weekEnd),
    db.from("blockers").select("title, severity, status, created_at, resolved_at, project_id").eq("raised_by", student),
    db.from("decisions").select("title, decided_on, project_id").in("project_id", mine).gte("decided_on", lastWeek).lte("decided_on", weekEnd),
    db.from("remarks").select("created_at, kind").in("project_id", mine).eq("author_id", prof),
  ]);
  // The report is a snapshot from the day it was submitted: tasks created later
  // don't exist yet, and anything finished later was still open.
  const submittedAt = new Date(`${addDays(lastWeek, 4 + submittedOn)}T17:42:00+05:30`).toISOString();
  const asOfThen = (tasks.data ?? [])
    .filter((t) => t.created_at <= submittedAt)
    .map((t) =>
      t.completed_at && t.completed_at > submittedAt
        ? { ...t, status: "in_progress" as const, completed_at: null }
        : t.status !== "done" && t.status !== "todo"
          ? { ...t, status: "in_progress" as const }
          : t,
    );
  const report = buildWeeklyReport({
    weekStart: lastWeek,
    today: addDays(lastWeek, 4 + submittedOn),
    timeZone: TZ,
    projects: projects.data ?? [],
    tasks: asOfThen,
    logs: logs.data ?? [],
    blockers: blockerRows.data ?? [],
    decisions: decisions.data ?? [],
    remarks: remarkRows.data ?? [],
  });
  const row = check(
    "report",
    await db
      .from("weekly_reports")
      .insert({ student_id: student, week_start: lastWeek, stats: report.stats, highlights: report.highlights, student_note: note, submitted_at: submittedAt, created_at: submittedAt })
      .select("id")
      .single(),
  );
  if (acknowledged) {
    check("acknowledge", await db.from("weekly_reports").update({ acknowledged_at: new Date(`${addDays(lastWeek, 5 + submittedOn)}T10:05:00+05:30`).toISOString(), acknowledged_by: prof }).eq("id", row.id));
  }
}
await submitReport(riya, "The dead-time fix cost a day, but the simulation now matches the hand calculation. I'd like 15 minutes on Monday about the gate-driver overshoot target.", true, 0);
await submitReport(kabir, "", false, 0);
await submitReport(ananya, "Protocol v2 is ahead of schedule.", false, 1);
console.log("✓ weekly reports");

console.log(`
Done. Sign in with password "${PASSWORD}":
  Professor  prof.mehta${DOMAIN}   (6 students, 3 reviews waiting, 2 blockers)
  Student    riya${DOMAIN}         (change request open, 2 overdue, a task in review)
  Student    arjun${DOMAIN}        (overdue, high blocker, quiet for 5 days)
  Also       meera, dev, kabir, ananya${DOMAIN}
`);
