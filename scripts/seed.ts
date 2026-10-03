// Demo data: the world the interface spec is drawn in. Prof. Anita Mehta
// supervises six students across five projects; Riya Gupta is mid-way through
// "Structured pruning for graph neural networks" with a change request open,
// a task in review, two overdue items and twelve weeks of progress logs.
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

const gnn = await project({
  title: "Structured pruning for graph neural networks",
  description:
    "Can channel-level pruning cut GNN inference cost by 50% with under 1 point of accuracy loss on Cora, PubMed and ogbn-arxiv? Target: a workshop paper by the end of November.",
  start: -80,
  end: 53,
  by: riya,
  members: [riya, arjun],
  milestones: [
    { title: "Reproduce baselines", due: -13 },
    { title: "Preliminary results", due: 2 },
    { title: "Workshop paper draft", due: 35 },
  ],
});
const survey = await project({
  title: "Survey of efficient GNN inference",
  description: "A survey of pruning, quantisation and sampling methods for fast GNN inference, organised by where the cost goes.",
  start: -30,
  end: 75,
  by: dev,
  members: [dev, riya],
  milestones: [
    { title: "Survey §2 outline", due: -4 },
    { title: "Survey first draft", due: 16 },
  ],
});
const contrastive = await project({
  title: "Contrastive pretraining for molecular graphs",
  description: "Does contrastive pretraining on unlabelled molecules help property prediction when labels are scarce?",
  start: -60,
  end: 60,
  by: meera,
  members: [meera],
  milestones: [
    { title: "Pretraining pipeline", due: -5 },
    { title: "Downstream evaluation", due: 20 },
  ],
});
const federated = await project({
  title: "Federated GNN survey",
  description: "Survey of federated learning for graph data: partitioning, privacy, and communication cost.",
  start: -70,
  end: 40,
  by: kabir,
  members: [kabir],
  milestones: [
    { title: "Taxonomy", due: 9 },
    { title: "Full draft", due: 35 },
  ],
});
const temporal = await project({
  title: "Temporal graph benchmarks",
  description: "A benchmark suite for temporal link prediction with leakage-free splits.",
  start: -85,
  end: 20,
  by: ananya,
  members: [ananya],
  milestones: [
    { title: "Datasets", due: -30 },
    { title: "Splits and baselines", due: 5 },
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
  // GNN pruning: Riya
  { key: "litreview", project: gnn, milestone: "Reproduce baselines", title: "Literature review on GNN pruning", assignee: riya, prof: -62, status: "done", created: -80, completed: -63, estimate: 12 },
  { key: "pipeline", project: gnn, milestone: "Reproduce baselines", title: "Set up the training pipeline", assignee: riya, prof: -45, status: "done", created: -70, completed: -46, estimate: 8 },
  { key: "gcn", project: gnn, milestone: "Reproduce baselines", title: "Reproduce GCN baseline on Cora", assignee: riya, prof: -13, status: "done", created: -40, completed: -11, estimate: 6 },
  { key: "leak", project: gnn, milestone: "Reproduce baselines", title: "Fix data split leakage in loader", assignee: riya, prof: -12, status: "done", priority: "high", created: -14, completed: -12 },
  { key: "mask", project: gnn, milestone: "Preliminary results", title: "Implement channel pruning mask", assignee: riya, prof: 1, mine: 0, status: "in_review", priority: "high", estimate: 10, created: -20, submitted: 1,
    description: "A per-layer channel mask with a straight-through estimator, so pruned models run on dense kernels. Done when it trains end to end on Cora within 1.2x of the unpruned step time." },
  { key: "ablation", project: gnn, milestone: "Preliminary results", title: "Run ablation: pruning ratio 10–70%", assignee: riya, prof: 4, mine: 2, status: "in_progress", priority: "high", estimate: 12, created: -10, submitted: 3,
    description: "Sweep the pruning ratio on Cora and PubMed with 5 seeds each; report accuracy and FLOPs per ratio. Done when table v3 is in the Overleaf draft." },
  { key: "variance", project: gnn, milestone: "Preliminary results", title: "Fix seed variance at 70% pruning ratio", assignee: riya, prof: -1, status: "in_progress", priority: "high", estimate: 4, created: -4 },
  { key: "revise", project: gnn, milestone: "Preliminary results", title: "Revise ablation table with random baseline", assignee: riya, prof: 0, status: "in_progress", priority: "high", estimate: 3, created: -2 },
  { key: "pubmed", project: gnn, milestone: "Preliminary results", title: "Retry PubMed sweep with batch 64", assignee: riya, mine: 0, status: "in_progress", priority: "medium", estimate: 2.5, created: -4 },
  { key: "random", project: gnn, milestone: "Preliminary results", title: "Add random-pruning baseline", assignee: riya, mine: 1, status: "todo", priority: "high", estimate: 4, created: -2,
    description: "Random channel pruning at every ratio, 5 seeds above 50%." },
  { key: "compare", project: gnn, milestone: "Preliminary results", title: "Compare against unstructured magnitude pruning", assignee: riya, prof: 3, status: "todo", estimate: 6, created: -9 },
  { key: "outline", project: gnn, milestone: "Workshop paper draft", title: "Outline method section", assignee: riya, mine: 4, status: "todo", priority: "low", created: -6 },
  { key: "plot", project: gnn, milestone: "Workshop paper draft", title: "Plot accuracy vs. FLOPs curves", assignee: riya, prof: 10, mine: 8, status: "todo", created: -10 },
  { key: "method", project: gnn, milestone: "Workshop paper draft", title: "Write method section", assignee: riya, prof: 18, status: "todo", created: -10 },
  { key: "figures", project: gnn, milestone: "Workshop paper draft", title: "Final ablation figures", assignee: riya, prof: 24, status: "todo", created: -10 },
  { key: "draft", project: gnn, milestone: "Workshop paper draft", title: "Workshop draft to Prof. Mehta", assignee: riya, prof: 29, status: "todo", priority: "high", created: -10 },
  // GNN pruning: Arjun
  { key: "gat", project: gnn, milestone: "Reproduce baselines", title: "Reproduce GAT baseline on PubMed", assignee: arjun, prof: -13, status: "done", estimate: 8, created: -40, completed: -14 },
  { key: "latency", project: gnn, milestone: "Preliminary results", title: "Profile inference latency on ogbn-arxiv", assignee: arjun, prof: -1, status: "in_progress", estimate: 6, created: -15 },
  { key: "cpu", project: gnn, milestone: "Workshop paper draft", title: "Benchmark pruned models on CPU", assignee: arjun, prof: 12, status: "todo", created: -15 },
  // Survey paper: Riya and Dev
  { key: "papers", project: survey, milestone: "Survey §2 outline", title: "Collect 40 core papers", assignee: dev, prof: -12, status: "done", created: -30, completed: -13 },
  { key: "s2outline", project: survey, milestone: "Survey §2 outline", title: "Survey §2 outline", assignee: riya, prof: -4, status: "done", created: -20, completed: -4 },
  { key: "lottery", project: survey, milestone: "Survey first draft", title: "Read 3 papers on lottery-ticket pruning", assignee: riya, mine: -2, status: "todo", created: -8 },
  { key: "related", project: survey, milestone: "Survey first draft", title: "Draft related-work section", assignee: riya, prof: 12, mine: 5, status: "in_progress", estimate: 10, created: -12 },
  { key: "s2full", project: survey, milestone: "Survey first draft", title: "Survey §2 full draft", assignee: riya, prof: 13, status: "todo", created: -4 },
  { key: "taxonomy", project: survey, milestone: "Survey first draft", title: "Taxonomy of GNN acceleration methods", assignee: dev, prof: 6, status: "in_progress", estimate: 8, created: -12 },
  // Meera
  { key: "zincpipe", project: contrastive, milestone: "Pretraining pipeline", title: "Molecule featurisation pipeline", assignee: meera, prof: -30, status: "done", created: -55, completed: -31 },
  { key: "zinc", project: contrastive, milestone: "Pretraining pipeline", title: "Pretrain on ZINC-250k subset", assignee: meera, prof: -3, status: "in_progress", priority: "high", estimate: 10, created: -20 },
  { key: "augment", project: contrastive, milestone: "Pretraining pipeline", title: "Augmentation ablation", assignee: meera, prof: -1, status: "todo", created: -15 },
  { key: "finetune", project: contrastive, milestone: "Downstream evaluation", title: "Fine-tune on MoleculeNet tasks", assignee: meera, prof: 14, status: "todo", created: -15 },
  // Kabir
  { key: "fedsearch", project: federated, milestone: "Taxonomy", title: "Systematic search and screening", assignee: kabir, prof: -40, status: "done", created: -65, completed: -42 },
  { key: "fedread", project: federated, milestone: "Taxonomy", title: "Read and code 60 papers", assignee: kabir, prof: -10, status: "done", created: -50, completed: -11 },
  { key: "fedtable", project: federated, milestone: "Taxonomy", title: "Taxonomy table for survey §3", assignee: kabir, prof: 9, status: "in_review", created: -10, submittedHours: 2 },
  { key: "fedintro", project: federated, milestone: "Full draft", title: "Write the introduction", assignee: kabir, prof: 20, status: "todo", created: -10 },
  // Ananya
  { key: "tdata", project: temporal, milestone: "Datasets", title: "Collect 8 temporal datasets", assignee: ananya, prof: -32, status: "done", created: -80, completed: -33 },
  { key: "tclean", project: temporal, milestone: "Datasets", title: "Clean and deduplicate edges", assignee: ananya, prof: -28, status: "done", created: -70, completed: -29 },
  { key: "tsplit1", project: temporal, milestone: "Splits and baselines", title: "Temporal split v1", assignee: ananya, prof: -15, status: "done", created: -40, completed: -16 },
  { key: "tbase", project: temporal, milestone: "Splits and baselines", title: "Run TGN and JODIE baselines", assignee: ananya, prof: -6, status: "done", created: -30, completed: -7 },
  { key: "tsplit2", project: temporal, milestone: "Splits and baselines", title: "Temporal split for benchmark v2", assignee: ananya, prof: 4, status: "in_review", created: -12, submittedHours: 6 },
  { key: "tpaper", project: temporal, milestone: "Paper", title: "Write the benchmark paper", assignee: ananya, prof: 18, status: "todo", created: -12 },
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
  if (s.key === "ablation") {
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
  { task_id: task("ablation"), depends_on_id: task("random") },
  { task_id: task("plot"), depends_on_id: task("ablation") },
  { task_id: task("compare"), depends_on_id: task("latency") },
  { task_id: task("method"), depends_on_id: task("mask") },
  { task_id: task("figures"), depends_on_id: task("plot") },
]));

// Deadline history: one extension granted by the professor, one slip of Riya's own target.
check("deadline history", await db.from("deadline_changes").insert([
  { task_id: task("ablation"), project_id: gnn.id, field: "professor", old_value: day(-1), new_value: day(4), changed_by: prof, changed_at: at(-2, "11:15") },
  { task_id: task("ablation"), project_id: gnn.id, field: "personal", old_value: day(-2), new_value: day(2), changed_by: riya, changed_at: at(-2, "21:05") },
  { task_id: task("related"), project_id: survey.id, field: "personal", old_value: day(2), new_value: day(5), changed_by: riya, changed_at: at(-3, "09:40") },
]));
console.log(`✓ ${T.length} tasks`);

// ───────────────────────────── progress logs ─────────────────────────────

type LogSeed = { who: string; project: string; d: number; done: string; problems?: string; next?: string; min: number; tasks: string[]; writtenLate?: number };

// The last two weeks are written out; earlier weeks come from a small,
// deterministic generator so the consistency heatmap has twelve weeks of shape.
const recent: LogSeed[] = [
  // Riya, week 39
  { who: riya, project: gnn.id, d: -12, done: "Found the train/test leak in the loader (shuffled before split). Fixed and re-ran: 81.2%.", problems: "Lost half a day to it.", next: "Write the mask module.", min: 300, tasks: ["leak"] },
  { who: riya, project: gnn.id, d: -11, done: "Re-ran the GCN baseline with the fixed split: 81.4% (paper: 81.5%). Closed the reproduction.", next: "Start the pruning mask.", min: 210, tasks: ["gcn"] },
  { who: riya, project: gnn.id, d: -9, done: "Channel mask module with a straight-through estimator; unit tests pass.", problems: "Gradients explode at ratio > 0.6.", next: "Add gradient clipping.", min: 240, tasks: ["mask"] },
  { who: riya, project: gnn.id, d: -8, done: "Gradient clipping fixed the explosion. Mask works end to end on Cora.", next: "Integrate with the training loop.", min: 270, tasks: ["mask"] },
  { who: riya, project: survey.id, d: -8, done: "Sorted 40 papers into four method families for §2.", next: "Write the §2 outline.", min: 60, tasks: ["s2outline"] },
  { who: riya, project: gnn.id, d: -6, done: "Integrated mask into training; first pruned model at 30%: 80.1%.", problems: "Training is 2x slower than expected.", next: "Profile the masked forward pass.", min: 330, tasks: ["mask"], writtenLate: 1 },
  // Riya, week 40
  { who: riya, project: gnn.id, d: -5, done: "Profiled: the mask was recomputed per layer per step. Cached it: back to 1.1x.", next: "Start the ablation sweep.", min: 180, tasks: ["mask"] },
  { who: riya, project: gnn.id, d: -4, done: "Sweep 10–70% on Cora done (3 seeds).", problems: "PubMed OOM at batch 128.", next: "Retry PubMed with batch 64.", min: 290, tasks: ["ablation"], writtenLate: 1 },
  { who: riya, project: survey.id, d: -4, done: "Survey §2 outline finished: pruning, quantisation, sampling, distillation.", next: "Draft related work from the outline.", min: 75, tasks: ["s2outline", "related"] },
  { who: riya, project: gnn.id, d: -2, done: "Ablation table v1 drafted; sent for review.", problems: "Variance at 70% is high (±1.8).", next: "More seeds at high ratios.", min: 230, tasks: ["ablation", "variance"] },
  { who: riya, project: gnn.id, d: -1, done: "Mask PR cleaned up and submitted for review with the step-time numbers. Started 2 extra seeds at 70%.", problems: "Random baseline not run yet.", next: "Retry PubMed sweep with batch 64", min: 200, tasks: ["mask", "variance"] },
  { who: riya, project: survey.id, d: -1, done: "Related work: first two paragraphs on structured pruning.", next: "Read the lottery-ticket papers.", min: 90, tasks: ["related"] },
  // Arjun: quiet for five days
  { who: arjun, project: gnn.id, d: -12, done: "Latency harness for ogbn-arxiv using torch.profiler.", problems: "Cluster queue very long.", next: "Run on the full graph.", min: 150, tasks: ["latency"] },
  { who: arjun, project: gnn.id, d: -8, done: "Profiled the unpruned GCN on a subgraph: 96 ms/epoch.", next: "Full graph.", min: 140, tasks: ["latency"] },
  { who: arjun, project: gnn.id, d: -5, done: "First full-graph profile: 412 ms/epoch unpruned.", problems: "GPU quota exhausted after this run.", next: "Ask about quota.", min: 120, tasks: ["latency"] },
  // Meera: last log two days ago
  { who: meera, project: contrastive.id, d: -6, done: "Pretraining runs on 50k molecules; loss plateaus at epoch 12.", problems: "Not sure the ogbn-mag licence allows our use.", next: "Scale to 250k.", min: 260, tasks: ["zinc"] },
  { who: meera, project: contrastive.id, d: -4, done: "Scaled to 120k molecules; checkpointing every 2 epochs.", next: "Finish the 250k run.", min: 240, tasks: ["zinc"] },
  { who: meera, project: contrastive.id, d: -2, done: "250k run at epoch 6 of 20.", problems: "Run crashed once (node preempted).", next: "Resume from checkpoint.", min: 150, tasks: ["zinc"] },
  // Dev: last log three days ago
  { who: dev, project: survey.id, d: -7, done: "Drafted the taxonomy axes: what is pruned, when, and with what signal.", next: "Place the 40 papers on the axes.", min: 180, tasks: ["taxonomy"] },
  { who: dev, project: survey.id, d: -5, done: "Placed 25 of 40 papers.", next: "Finish placing; discuss gaps with Riya.", min: 140, tasks: ["taxonomy"] },
  { who: dev, project: survey.id, d: -3, done: "Placed all 40; found 3 papers that don't fit any axis.", problems: "Taxonomy may need a fourth axis.", next: "Decide on the fourth axis.", min: 120, tasks: ["taxonomy"] },
  // Kabir: steady
  ...[-5, -4, -3, -2, -1, 0].map((d, i) => ({
    who: kabir, project: federated.id, d, min: [110, 95, 120, 100, 85, 80][i], tasks: ["fedtable"],
    done: ["Coded 12 papers into the taxonomy table.", "Coded 10 more; merged two categories.", "Taxonomy table draft complete.", "Rewrote category definitions after re-reading.", "Polished table; added a legend.", "Submitted the taxonomy table for review."][i],
    next: ["Continue coding.", "Finish coding.", "Re-read the definitions.", "Polish and add legend.", "Submit for review.", "Start the introduction."][i],
  })),
  // Ananya: steady, ahead of plan
  ...[-6, -5, -4, -3, -2, -1, 0].map((d, i) => ({
    who: ananya, project: temporal.id, d, min: [150, 130, 120, 140, 110, 90, 100][i], tasks: [i < 2 ? "tbase" : "tsplit2"],
    done: ["JODIE baseline done on 8 datasets.", "TGN baseline done; numbers match the papers within 0.5.", "Split v2: removed edges seen before the cutoff.", "Leakage check passes on all datasets.", "Re-ran baselines on split v2.", "Wrote the split's README.", "Submitted split v2 for review."][i],
    next: ["Run TGN.", "Start split v2.", "Check leakage.", "Re-run baselines.", "Document the split.", "Submit.", "Start the paper outline."][i],
  })),
];

// Older weeks: Riya logs most weekdays and some weekends.
const older: LogSeed[] = [];
let seed = 7;
const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const riyaOld = [
  { from: -80, to: -63, task: "litreview",
    done: ["Read and summarised 3 pruning papers.", "Annotated the network slimming paper.", "Compared magnitude vs. learned masks in 4 papers.", "Wrote a one-page summary of channel pruning methods.", "Read the lottery-ticket follow-ups on GNNs.", "Listed open questions for the meeting."],
    next: ["Read the GNN-specific pruning papers.", "Summarise the structured methods.", "Pick 2 baselines to reproduce.", "Ask Prof. Mehta which venue to aim for."],
    problems: ["Two papers report different Cora numbers for the same model.", "", "", ""] },
  { from: -62, to: -46, task: "pipeline",
    done: ["Training loop for GCN with config files.", "Added evaluation and checkpointing.", "Logging to wandb; reproducible seeds.", "Data loaders for Cora and PubMed.", "Unit tests for the data split."],
    next: ["Add checkpointing.", "Hook up wandb.", "Test on PubMed.", "Start the GCN reproduction."],
    problems: ["Seeds weren't fixed in the loader; results drifted.", "", "", "Cluster queue slow on Fridays."] },
  { from: -45, to: -13, task: "gcn",
    done: ["Baseline GCN training on Cora.", "Hyperparameter sweep for the baseline.", "Matched the paper's preprocessing.", "Baseline at 80.6%; gap to the paper is 0.9.", "Tried the paper's dropout schedule: 80.9%."],
    next: ["Check preprocessing against the paper.", "Sweep learning rate and weight decay.", "Try the paper's dropout schedule.", "Look for a data leak."],
    problems: ["Still 0.9 below the paper.", "", "Variance across seeds is ±0.6.", ""] },
];
for (const phase of riyaOld) {
  for (let d = phase.from; d <= phase.to; d++) {
    if (d >= -12) break;
    const weekend = [6, 7].includes(new Date(`${day(d)}T12:00:00Z`).getUTCDay() || 7);
    if (rand() > (weekend ? 0.25 : 0.75)) continue;
    const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
    older.push({
      who: riya, project: gnn.id, d, tasks: [phase.task],
      done: pick(phase.done),
      problems: pick(phase.problems),
      next: pick(phase.next),
      min: 60 + Math.round(rand() * 6) * 30,
    });
  }
}
for (let d = -40; d <= -14; d++) {
  if (rand() > 0.45) continue;
  const arjunDone = ["GAT baseline runs on PubMed.", "Tuned attention dropout for GAT.", "GAT at 78.6%; checking the heads config.", "Matched the paper's 8 heads; 79.0%."];
  older.push({ who: arjun, project: gnn.id, d, tasks: ["gat"], done: arjunDone[Math.floor(rand() * arjunDone.length)], next: "Keep tuning GAT.", min: 90 + Math.round(rand() * 4) * 30 });
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
  { project_id: gnn.id, uploader_id: riya, kind: "link", name: "github.com/riya/gnn-prune/pull/14", url: "https://github.com/riya/gnn-prune/pull/14", task_id: task("mask"), created_at: at(-1, "17:35") },
  { project_id: gnn.id, uploader_id: riya, kind: "link", name: "Ablation table v1 (Overleaf)", url: "https://www.overleaf.com/project/demo", task_id: task("ablation"), created_at: at(-2, "18:50") },
  { project_id: gnn.id, uploader_id: riya, kind: "link", name: "wandb: PubMed sweep, batch 128 (OOM)", url: "https://wandb.ai/riya/gnn-prune/runs/pubmed-128", task_id: task("pubmed"), created_at: at(-4, "20:10") },
  { project_id: federated.id, uploader_id: kabir, kind: "link", name: "Taxonomy table (Google Sheets)", url: "https://docs.google.com/spreadsheets/d/demo", task_id: task("fedtable"), created_at: hoursAgo(2) },
  { project_id: temporal.id, uploader_id: ananya, kind: "link", name: "Split v2 README", url: "https://github.com/ananya/tgb/blob/main/SPLITS.md", task_id: task("tsplit2"), created_at: hoursAgo(6) },
]));

// ───────────────────────────── remarks, blockers, decisions ─────────────────────────────

const remarks = check(
  "remarks",
  await db
    .from("remarks")
    .insert([
      { project_id: gnn.id, task_id: task("ablation"), author_id: prof, kind: "change_request" as const, created_at: at(-2, "10:40"),
        body: "Good start. Before I approve: add the random-pruning baseline at every ratio, and use 5 seeds above 50%." },
      { project_id: gnn.id, author_id: prof, kind: "question" as const, created_at: at(-1, "12:15"),
        body: "Which venue are we targeting for the workshop paper? The page limit changes how much of the ablation goes in the main text." },
      { project_id: gnn.id, task_id: task("gcn"), author_id: prof, kind: "approval" as const, created_at: at(-11, "18:00"), body: "Matches the paper. Approved." },
      { project_id: gnn.id, task_id: task("variance"), author_id: prof, kind: "comment" as const, created_at: at(-1, "21:10"),
        body: "Is the variance from the seeds or the data split? Check before adding more seeds." },
      { project_id: contrastive.id, task_id: task("zinc"), author_id: prof, kind: "comment" as const, created_at: at(-3, "15:00"),
        body: "Keep a 10k-molecule run as a sanity check alongside the big one." },
    ])
    .select("id, kind, task_id"),
);
const changeRequest = remarks[0].id;
// The follow-up tasks Riya made from the change request.
check("follow-ups", await db.from("tasks").update({ source_remark_id: changeRequest }).in("id", [task("random"), task("revise")]));
// The approval was acted on long ago.
check("addressed", await db.from("remarks").update({ addressed_at: at(-11, "18:30") }).eq("id", remarks[2].id));

const blockers = check(
  "blockers",
  await db
    .from("blockers")
    .insert([
      { project_id: gnn.id, task_id: task("latency"), raised_by: arjun, severity: "high" as const, needs_professor: true, created_at: at(-5, "18:40"),
        title: "GPU quota exhausted on the department cluster",
        description: "Quota reset is 2 weeks away. Need either a quota increase or access to the lab's A100 node." },
      { project_id: contrastive.id, raised_by: meera, severity: "medium" as const, needs_professor: true, created_at: at(-2, "16:00"),
        title: "Dataset licence for ogbn-mag unclear",
        description: "The licence page is ambiguous about derived embeddings. Can the department confirm?" },
      { project_id: federated.id, raised_by: kabir, severity: "low" as const, needs_professor: false, created_at: at(-3, "11:00"),
        title: "Two survey papers are paywalled",
        description: "Library request sent." },
      { project_id: gnn.id, task_id: task("pubmed"), raised_by: riya, severity: "medium" as const, needs_professor: false, created_at: at(-4, "20:15"),
        title: "PubMed runs OOM at batch 128",
        description: "Out of memory on the 16 GB cards." },
    ])
    .select("id"),
);
check("resolve", await db.from("blockers").update({ status: "resolved", resolution: "Batch 64 fits and converges the same." }).eq("id", blockers[3].id));
check("resolve time", await db.from("blockers").update({ resolved_at: at(-2, "12:00") }).eq("id", blockers[3].id));

check("decisions", await db.from("decisions").insert([
  { project_id: gnn.id, author_id: riya, decided_on: day(-30), created_at: at(-30, "17:00"),
    title: "Prune channels (structured), not individual weights",
    context: "Unstructured sparsity doesn't speed up inference on commodity GPUs without sparse kernels.",
    decision: "Use channel-level masks so pruned models run faster with standard dense kernels.",
    alternatives: "Unstructured magnitude pruning (kept as a comparison baseline); low-rank factorisation (deferred)." },
  { project_id: gnn.id, author_id: riya, decided_on: day(-4), created_at: at(-4, "20:20"),
    title: "Use batch 64 for PubMed",
    context: "Batch 128 runs out of memory on the 16 GB cards.",
    decision: "All PubMed runs use batch 64; learning rate scaled by 0.5.",
    alternatives: "Gradient checkpointing (slower, kept as a fallback)." },
]));

// Arjun asked for more time on the latency profile (only if the extension
// requests migration has been applied).
const ext = await db.from("extension_requests").insert({
  task_id: task("latency"), project_id: gnn.id, requested_by: arjun, current_deadline: day(-1), proposed_deadline: day(6),
  reason: "GPU quota ran out after the first full-graph run; the quota resets next week.", created_at: at(-1, "09:20"),
});
console.log(`✓ remarks, blockers, decisions${ext.error ? " (extension requests skipped: apply migration 20261004000006 first)" : ", an extension request"}`);

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
await submitReport(riya, "The leak fix cost a day, but the baseline now matches the paper. I'd like 15 minutes on Monday about the mask's step-time target.", true, 0);
await submitReport(kabir, "", false, 0);
await submitReport(ananya, "Split v2 is ahead of schedule.", false, 1);
console.log("✓ weekly reports");

console.log(`
Done. Sign in with password "${PASSWORD}":
  Professor  prof.mehta${DOMAIN}   (6 students, 3 reviews waiting, 2 blockers)
  Student    riya${DOMAIN}         (change request open, 2 overdue, a task in review)
  Student    arjun${DOMAIN}        (overdue, high blocker, quiet for 5 days)
  Also       meera, dev, kabir, ananya${DOMAIN}
`);
