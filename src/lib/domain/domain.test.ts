// Unit tests for the pure domain logic. Run: npm run test:unit

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { addDays, dateIn, daysBetween, formatMinutes, isoWeekNumber, parseDuration, weekStartOf, isValidISODate } from "./dates.ts";
import { deadlineLabel, finishedOnTime, urgency } from "./deadlines.ts";
import { projectProgress } from "./progress.ts";
import { needsResponse, professorNextAction, shortName, studentNextAction, type ActionRemark, type ActionTask, type StudentActionInput } from "./next-action.ts";
import { delayRisk } from "./risk.ts";
import { buildWeeklyReport } from "./weekly-report.ts";
import { activityByDay, logStreak, minutesPerWeek, slipRate } from "./analytics.ts";

const TODAY = "2026-10-03"; // a Saturday

describe("dates", () => {
  it("does calendar arithmetic across month and year boundaries", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(daysBetween("2026-10-01", "2026-10-03"), 2);
    assert.equal(daysBetween("2026-10-03", "2026-10-01"), -2);
  });

  it("finds the Monday of a week, and the ISO week number", () => {
    assert.equal(weekStartOf("2026-10-03"), "2026-09-28");
    assert.equal(weekStartOf("2026-09-28"), "2026-09-28");
    assert.equal(weekStartOf("2026-10-04"), "2026-09-28"); // Sunday
    assert.equal(isoWeekNumber("2026-10-03"), 40);
    assert.equal(isoWeekNumber("2027-01-01"), 53);
  });

  it("puts an instant on the right calendar day for the timezone", () => {
    // 20:00 UTC on the 3rd is already the 4th in India.
    assert.equal(dateIn("2026-10-03T20:00:00Z", "Asia/Kolkata"), "2026-10-04");
    assert.equal(dateIn("2026-10-03T20:00:00Z", "America/New_York"), "2026-10-03");
  });

  it("validates ISO dates strictly", () => {
    assert.ok(isValidISODate("2026-02-28"));
    assert.ok(!isValidISODate("2026-02-30"));
    assert.ok(!isValidISODate("3/10/2026"));
  });

  it("formats durations", () => {
    assert.equal(formatMinutes(150), "2h 30m");
    assert.equal(formatMinutes(45), "45m");
    assert.equal(formatMinutes(120), "2h");
  });
});

describe("deadlines", () => {
  it("bands urgency: overdue, today, within 48h, this week, later", () => {
    assert.equal(urgency("2026-10-02", TODAY), "overdue");
    assert.equal(urgency("2026-10-03", TODAY), "today");
    assert.equal(urgency("2026-10-04", TODAY), "soon");
    assert.equal(urgency("2026-10-08", TODAY), "week");
    assert.equal(urgency("2026-11-01", TODAY), "later");
    assert.equal(urgency(null, TODAY), "none");
    assert.equal(urgency("2026-10-01", TODAY, "done"), "done");
  });

  it("labels deadlines the way people say them", () => {
    assert.equal(deadlineLabel("2026-10-01", TODAY), "2d overdue");
    assert.equal(deadlineLabel(TODAY, TODAY), "today");
    assert.equal(deadlineLabel("2026-10-04", TODAY), "tomorrow");
    assert.equal(deadlineLabel("2026-10-07", TODAY), "in 4d");
    assert.equal(deadlineLabel("2026-11-20", TODAY), "Fri 20 Nov");
  });

  it("judges on-time completion in the student's timezone", () => {
    const task = { status: "done" as const, professor_deadline: "2026-10-03", personal_deadline: null, completed_at: "2026-10-03T17:00:00Z" };
    // 22:30 in India on the due date: on time.
    assert.equal(finishedOnTime(task, "Asia/Kolkata"), true);
    // 01:00 in Tokyo on the 4th: late.
    assert.equal(finishedOnTime({ ...task, completed_at: "2026-10-03T16:00:00Z" }, "Asia/Tokyo"), false);
    assert.equal(finishedOnTime({ ...task, status: "in_progress" }, "Asia/Kolkata"), null);
  });
});

describe("progress", () => {
  it("weights milestones equally, so many small tasks can't drown a hard one", () => {
    const tasks = [
      ...Array.from({ length: 9 }, () => ({ status: "done" as const, milestone_id: "setup" })),
      { status: "todo" as const, milestone_id: "experiments" },
    ];
    assert.equal(projectProgress(tasks, [{ id: "setup" }, { id: "experiments" }]), 0.5);
  });

  it("is zero with no tasks", () => {
    assert.equal(projectProgress([], []), 0);
  });
});

const task = (over: Partial<ActionTask>): ActionTask => ({
  id: over.id ?? "t",
  title: over.title ?? "Task",
  status: "todo",
  priority: "medium",
  assignee_id: "me",
  project_id: "p",
  professor_deadline: null,
  effective_deadline: null,
  submitted_at: null,
  ...over,
});

const remark = (over: Partial<ActionRemark>): ActionRemark => ({
  id: "r",
  body: "Please add the random baseline",
  kind: "change_request",
  source: "app",
  task_id: null,
  project_id: "p",
  parent_id: null,
  addressed_at: null,
  created_at: "2026-10-01T10:00:00Z",
  author_role: "professor",
  ...over,
});

const studentInput = (over: Partial<StudentActionInput>): StudentActionInput => ({
  userId: "me",
  today: TODAY,
  tasks: [],
  dependencies: [],
  remarks: [],
  blockers: [],
  loggedToday: false,
  ...over,
});

describe("next action (student)", () => {
  it("puts an unanswered professor request above an overdue task", () => {
    const action = studentNextAction(
      studentInput({
        tasks: [task({ id: "late", effective_deadline: "2026-09-30", professor_deadline: "2026-09-30" })],
        remarks: [remark({ task_id: "late" })],
      }),
    );
    assert.equal(action.kind, "respond_remark");
    assert.equal(action.href, "/tasks/late#remark-r");
    assert.match(action.reason, /2 days ago/);
  });

  it("ignores a student's own comment, but counts a meeting note they recorded", () => {
    assert.equal(needsResponse(remark({ author_role: "student", kind: "comment" })), false);
    assert.equal(needsResponse(remark({ author_role: "student", source: "meeting" })), true);
    assert.equal(needsResponse(remark({ addressed_at: "2026-10-02T00:00:00Z" })), false);
  });

  it("leaves a request about a lab-mate's task to the lab-mate", () => {
    const tasks = [
      task({ id: "hers", assignee_id: "riya" }),
      task({ id: "late", title: "Mine, late", effective_deadline: "2026-10-01", professor_deadline: "2026-10-01" }),
    ];
    const action = studentNextAction(studentInput({ tasks, remarks: [remark({ task_id: "hers" })] }));
    assert.equal(action.kind, "overdue_task");
    assert.equal(action.href, "/tasks/late");
    // A project-level request still waits on everyone.
    assert.equal(studentNextAction(studentInput({ tasks, remarks: [remark({ task_id: null })] })).kind, "respond_remark");
  });

  it("ranks a professor-deadline overdue task above a more overdue personal one", () => {
    const action = studentNextAction(
      studentInput({
        tasks: [
          task({ id: "personal", title: "Personal", effective_deadline: "2026-09-25" }),
          task({ id: "prof", title: "Prof", effective_deadline: "2026-10-01", professor_deadline: "2026-10-01" }),
        ],
      }),
    );
    assert.equal(action.kind, "overdue_task");
    assert.equal(action.href, "/tasks/prof");
    assert.match(action.reason, /2 days overdue on a professor deadline · 1 more overdue/);
  });

  it("skips tasks blocked by unfinished dependencies", () => {
    const action = studentNextAction(
      studentInput({
        tasks: [
          task({ id: "blocked", title: "Blocked", effective_deadline: "2026-10-04" }),
          task({ id: "dep", title: "Dep", status: "in_review" }),
          task({ id: "free", title: "Free", effective_deadline: "2026-10-20" }),
        ],
        dependencies: [{ task_id: "blocked", depends_on_id: "dep" }],
      }),
    );
    assert.equal(action.kind, "start_task");
    assert.equal(action.href, "/tasks/free");
  });

  it("prefers finishing an in-progress task due soon over starting one", () => {
    const action = studentNextAction(
      studentInput({
        tasks: [
          task({ id: "a", title: "A", effective_deadline: TODAY }),
          task({ id: "b", title: "B", status: "in_progress", effective_deadline: "2026-10-04" }),
        ],
      }),
    );
    assert.equal(action.kind, "due_soon");
    assert.equal(action.title, 'Finish "B"');
  });

  it("does not hand you someone else's task", () => {
    const action = studentNextAction(studentInput({ tasks: [task({ assignee_id: "other", effective_deadline: "2026-09-01" })] }));
    assert.equal(action.kind, "plan");
  });

  it("asks for a log when everything is under review", () => {
    const action = studentNextAction(studentInput({ tasks: [task({ status: "in_review" })] }));
    assert.equal(action.kind, "write_log");
  });
});

describe("next action (professor)", () => {
  it("puts the oldest pending review first", () => {
    const action = professorNextAction({
      today: TODAY,
      pendingReviews: [
        { ...task({ id: "new", title: "New" }), submitted_at: "2026-10-03T08:00:00Z", studentName: "Riya" },
        { ...task({ id: "old", title: "Old" }), submitted_at: "2026-09-30T08:00:00Z", studentName: "Arjun" },
      ],
      blockers: [],
      staleStudents: [{ studentId: "s", name: "Eve", daysSinceLog: 9 }],
      unacknowledgedReports: [],
    });
    assert.equal(action.title, 'Review "Old" from Arjun');
    assert.equal(action.tone, "warning");
  });

  it("falls through to a stale student when nothing else waits", () => {
    const action = professorNextAction({
      today: TODAY,
      pendingReviews: [],
      blockers: [],
      staleStudents: [
        { studentId: "a", name: "A", daysSinceLog: 3 },
        { studentId: "b", name: "B", daysSinceLog: 8 },
      ],
      unacknowledgedReports: [],
    });
    assert.equal(action.href, "/students/b");
  });
});

describe("delay risk", () => {
  const base = {
    today: TODAY,
    openBlockers: 0,
    openDependencies: 0,
    evidenceCount: 0,
    lastLogDate: null,
    slipRate: 0,
  };

  it("flags an unstarted task near its deadline as high risk, with reasons", () => {
    const risk = delayRisk({
      ...base,
      task: { status: "todo", effective_deadline: "2026-10-04", created_at: "2026-09-20T00:00:00Z", estimate_hours: null },
      openBlockers: 1,
    });
    assert.equal(risk.level, "high");
    assert.deepEqual(risk.reasons, ["Not started, 1 day left", "Open blocker", "Due tomorrow"]);
  });

  it("calls a healthy in-progress task low risk", () => {
    const risk = delayRisk({
      ...base,
      task: { status: "in_progress", effective_deadline: "2026-10-20", created_at: "2026-09-25T00:00:00Z", estimate_hours: 6 },
      evidenceCount: 2,
      lastLogDate: "2026-10-02",
    });
    assert.equal(risk.level, "low");
  });

  it("has nothing to say about finished work or work under review", () => {
    for (const status of ["done", "in_review"] as const) {
      const risk = delayRisk({ ...base, task: { status, effective_deadline: "2026-09-01", created_at: "2026-08-01T00:00:00Z", estimate_hours: null } });
      assert.equal(risk.level, "none");
    }
  });
});

describe("weekly report", () => {
  const report = buildWeeklyReport({
    weekStart: "2026-09-28",
    today: "2026-10-05",
    timeZone: "Asia/Kolkata",
    projects: [
      { id: "p1", title: "GNN Pruning" },
      { id: "p2", title: "Survey" },
    ],
    tasks: [
      { id: "a", title: "Baseline", project_id: "p1", status: "done", professor_deadline: "2026-09-30", personal_deadline: null, effective_deadline: "2026-09-30", completed_at: "2026-09-30T10:00:00Z" },
      { id: "b", title: "Ablation", project_id: "p1", status: "done", professor_deadline: "2026-09-30", personal_deadline: null, effective_deadline: "2026-09-30", completed_at: "2026-10-02T10:00:00Z" },
      { id: "c", title: "Fix split", project_id: "p1", status: "in_progress", professor_deadline: "2026-10-01", personal_deadline: null, effective_deadline: "2026-10-01", completed_at: null },
      { id: "d", title: "Draft", project_id: "p2", status: "todo", professor_deadline: "2026-10-08", personal_deadline: "2026-10-06", effective_deadline: "2026-10-06", completed_at: null },
    ],
    logs: [
      { project_id: "p1", log_date: "2026-09-29", completed_work: "- Ran baseline\n- more", problems: "", next_steps: "", minutes_spent: 120 },
      { project_id: "p1", log_date: "2026-09-30", completed_work: "Ablation configs", problems: "OOM on config 4", next_steps: "", minutes_spent: 90 },
      { project_id: "p2", log_date: "2026-09-30", completed_work: "Read 3 papers", problems: "", next_steps: "", minutes_spent: 60 },
      { project_id: "p1", log_date: "2026-09-27", completed_work: "last week", problems: "", next_steps: "", minutes_spent: 500 },
    ],
    blockers: [
      { title: "GPU quota", severity: "high", status: "open", created_at: "2026-09-29T05:00:00Z", resolved_at: null, project_id: "p1" },
      { title: "Dataset licence", severity: "low", status: "resolved", created_at: "2026-09-20T05:00:00Z", resolved_at: "2026-10-01T05:00:00Z", project_id: "p2" },
    ],
    decisions: [{ title: "Use structured pruning", decided_on: "2026-10-01", project_id: "p1" }],
    remarks: [{ created_at: "2026-09-30T09:00:00Z", kind: "change_request" }],
  });

  it("counts only this week's logs", () => {
    assert.equal(report.stats.minutesLogged, 270);
    assert.equal(report.stats.activeDays, 2);
    assert.equal(report.stats.logCount, 3);
  });

  it("separates on-time from late completions", () => {
    assert.deepEqual(
      report.stats.completed.map((c) => [c.title, c.onTime]),
      [
        ["Baseline", true],
        ["Ablation", false],
      ],
    );
    assert.equal(report.stats.onTimeRate, 0.5);
  });

  it("lists missed professor deadlines, done-late and still-open", () => {
    assert.deepEqual(
      report.stats.missedProfessorDeadlines.map((m) => [m.title, m.daysLate, m.done]),
      [
        ["Ablation", 2, true],
        ["Fix split", 4, false],
      ],
    );
  });

  it("looks ahead to next week's deadlines", () => {
    assert.deepEqual(report.stats.upcoming.map((u) => [u.title, u.deadline, u.kind]), [["Draft", "2026-10-06", "personal"]]);
  });

  it("leads with a one-line conclusion", () => {
    assert.equal(
      report.summary,
      "Completed 2 tasks (1 on time) · 4h 30m over 2 days · 1 blocker resolved · 1 still open · 2 professor deadlines missed",
    );
  });

  it("distills highlights from the first line of each log, tagged by project", () => {
    assert.equal(
      report.highlights,
      [
        "- Tue 29 Sep: [GNN Pruning] Ran baseline",
        "- Wed 30 Sep: [GNN Pruning] Ablation configs (problem: OOM on config 4)",
        "- Wed 30 Sep: [Survey] Read 3 papers",
      ].join("\n"),
    );
  });

  it("breaks time down per project", () => {
    assert.deepEqual(
      report.stats.perProject.map((p) => [p.title, p.minutes, p.completed]),
      [
        ["GNN Pruning", 210, 2],
        ["Survey", 60, 0],
      ],
    );
  });
});

describe("analytics", () => {
  const logs = [
    { log_date: "2026-10-03", minutes_spent: 60 },
    { log_date: "2026-10-02", minutes_spent: 30 },
    { log_date: "2026-10-01", minutes_spent: 30 },
    { log_date: "2026-09-25", minutes_spent: 100 },
  ];

  it("buckets minutes into ISO weeks", () => {
    const weeks = minutesPerWeek(logs, TODAY, 2);
    assert.deepEqual(weeks, [
      { weekStart: "2026-09-21", minutes: 100 },
      { weekStart: "2026-09-28", minutes: 120 },
    ]);
  });

  it("counts a streak through yesterday when today has no log yet", () => {
    assert.equal(logStreak(logs, TODAY), 3);
    assert.equal(logStreak(logs, "2026-10-04"), 3);
    assert.equal(logStreak(logs, "2026-10-05"), 0);
  });

  it("lays the heatmap out in whole weeks", () => {
    const cells = activityByDay(logs, TODAY, 2);
    assert.equal(cells.length, 14);
    assert.equal(cells[0].date, "2026-09-21");
    assert.equal(cells.find((c) => c.date === "2026-10-03")?.minutes, 60);
  });

  it("counts only later moves as slips", () => {
    const rate = slipRate(
      [
        { id: "a", effective_deadline: "2026-10-10" },
        { id: "b", effective_deadline: "2026-10-10" },
      ],
      [
        { task_id: "a", old_value: "2026-10-05", new_value: "2026-10-10" },
        { task_id: "b", old_value: "2026-10-12", new_value: "2026-10-10" },
      ],
    );
    assert.equal(rate, 0.5);
  });
});

import { parseDateInput } from "./dates.ts";
import { usualMinutesOn, weekByDay } from "./analytics.ts";
import { professorInbox, studentInbox } from "./inbox.ts";
import { taskActivity } from "./activity.ts";

describe("typed dates", () => {
  // TODAY is Sat 3 Oct 2026.
  const cases: [string, string | null][] = [
    ["today", "2026-10-03"],
    ["tmr", "2026-10-04"],
    ["mon", "2026-10-05"],
    ["sat", "2026-10-10"],
    ["next fri", "2026-10-09"],
    ["in 3 days", "2026-10-06"],
    ["2w", "2026-10-17"],
    ["+10", null],
    ["eow", "2026-10-09"],
    ["eom", "2026-10-31"],
    ["7 oct", "2026-10-07"],
    ["Oct 2nd", "2027-10-02"],
    ["7/10", "2026-10-07"],
    ["31/2", null],
    ["2026-12-01", "2026-12-01"],
    ["15", "2026-10-15"],
    ["2", "2026-11-02"],
    ["whenever", null],
  ];
  for (const [input, expected] of cases) {
    it(`reads "${input}"`, () => assert.equal(parseDateInput(input, TODAY), expected));
  }
});

describe("capacity", () => {
  it("averages this weekday over recent weeks it was worked", () => {
    const logs = [
      { log_date: "2026-09-26", minutes_spent: 200 },
      { log_date: "2026-09-19", minutes_spent: 100 },
      { log_date: "2026-09-12", minutes_spent: 0 },
      { log_date: "2026-09-25", minutes_spent: 999 },
    ];
    assert.equal(usualMinutesOn(logs, TODAY), 150);
    assert.equal(usualMinutesOn(logs.slice(0, 1), TODAY), null);
  });

  it("lays out the current week Monday first", () => {
    const week = weekByDay([{ log_date: "2026-09-29", minutes_spent: 60 }, { log_date: "2026-09-29", minutes_spent: 30 }], TODAY);
    assert.equal(week.length, 7);
    assert.deepEqual(week[1], { date: "2026-09-29", minutes: 90 });
  });
});

describe("inbox", () => {
  const titles = new Map([["p", "GNN pruning"]]);
  it("lists what waits on the student, oldest first, then decisions about their work", () => {
    const items = studentInbox({
      userId: "me",
      today: TODAY,
      since: "2026-09-26T00:00:00Z",
      tasks: [
        { ...task({ id: "a", title: "Ablation", status: "changes_requested" }), updated_at: "2026-10-02T09:00:00Z" },
        { ...task({ id: "b", title: "Baseline", professor_deadline: "2026-10-01" }) },
        { ...task({ id: "c", title: "Hers", assignee_id: "riya" }) },
      ],
      remarks: [{ ...remark({ id: "r1", task_id: "c" }), author_name: "Prof" }, { ...remark({ id: "r2", task_id: null }), author_name: "Prof" }],
      extensions: [{ id: "e", task_id: "a", project_id: "p", status: "approved", proposed_deadline: "2026-10-09", decided_at: "2026-10-02T10:00:00Z", requested_by: "me" }],
      projectTitle: titles,
    });
    assert.deepEqual(
      items.map((i) => [i.id, i.needsAction]),
      [
        ["remark-r2", true],
        ["overdue-b", true],
        ["changes-a", true],
        ["ext-e", false],
      ],
    );
  });

  it("puts pending extension requests in the professor's queue with the reason", () => {
    const items = professorInbox({
      today: TODAY,
      reviews: [],
      blockers: [],
      extensions: [
        { id: "e", task_id: "t", project_id: "p", status: "pending", proposed_deadline: "2026-10-12", current_deadline: "2026-10-07", reason: "GPU queue", created_at: "2026-10-02T00:00:00Z", studentName: "Riya", taskTitle: "Ablation" },
      ],
      reports: [],
      quiet: [{ studentId: "s", name: "Arjun", daysSinceLog: 5 }],
    });
    assert.equal(items[0].title, 'Riya asks to move "Ablation" to Mon 12 Oct');
    assert.match(items[0].detail, /GPU queue.*now due Wed 7 Oct/);
    assert.equal(items[1].needsAction, false);
  });
});

describe("task activity", () => {
  it("builds one newest-first timeline from existing records", () => {
    const events = taskActivity({
      task: { id: "t", created_at: "2026-09-20T08:00:00Z", created_by: "prof", submitted_at: "2026-10-01T08:00:00Z", completed_at: null, status: "in_review", assignee_id: "me", requires_review: true },
      changes: [{ id: 1, field: "professor", old_value: "2026-10-03", new_value: "2026-10-07", changed_by: "prof", changed_at: "2026-09-30T08:00:00Z" }],
      logs: [{ id: "l", log_date: "2026-09-29", author_id: "me", created_at: "2026-09-29T18:00:00Z", minutes_spent: 60, completed_work: "Ran sweep\nmore" }],
      attachments: [],
      extensions: [],
    });
    assert.deepEqual(events.map((e) => e.kind), ["submitted", "deadline", "log", "created"]);
    assert.equal(events[1].text, "moved the professor deadline 3 Oct → 7 Oct");
    assert.equal(events[1].tone, "warning");
    assert.match(events[2].text, /"Ran sweep"$/);
  });
});

describe("weekly report extras", () => {
  const extras = buildWeeklyReport({
    weekStart: "2026-09-28",
    today: "2026-10-05",
    timeZone: "UTC",
    projects: [{ id: "p1", title: "GNN" }],
    tasks: [{ id: "x", title: "Seeds", project_id: "p1", status: "in_progress", professor_deadline: "2026-09-30", personal_deadline: null, effective_deadline: "2026-09-30", completed_at: null }],
    logs: [
      { project_id: "p1", log_date: "2026-09-29", completed_work: "a", problems: "OOM", next_steps: "batch 64", minutes_spent: 60 },
      { project_id: "p1", log_date: "2026-10-01", completed_work: "b", problems: "OOM", next_steps: "- lower LR\n- rerun", minutes_spent: 60 },
      { project_id: "p1", log_date: "2026-09-21", completed_work: "c", problems: "", next_steps: "", minutes_spent: 240 },
    ],
    blockers: [],
    decisions: [],
    remarks: [],
    extensions: [{ task_id: "x", reason: "Cluster down", created_at: "2026-09-29T00:00:00Z" }],
  }).stats;

  it("compares with the previous four weeks", () => assert.deepEqual(extras.averages, { minutes: 60, activeDays: 0.3 }));
  it("dedupes problems, newest first", () => assert.deepEqual(extras.problems, [{ date: "2026-10-01", project: "GNN", text: "OOM" }]));
  it("takes the plan from the latest log", () => assert.equal(extras.plan, "lower LR"));
  it("explains a delay with the extension reason", () => assert.equal(extras.missedProfessorDeadlines[0].reason, "Cluster down"));
});

describe("time spent and names", () => {
  it("reads durations the way people type them", () => {
    assert.equal(parseDuration("3h 10m"), 190);
    assert.equal(parseDuration("3h10m"), 190);
    assert.equal(parseDuration("45m"), 45);
    assert.equal(parseDuration("1.5h"), 90);
    assert.equal(parseDuration("1:30"), 90);
    assert.equal(parseDuration("2"), 120); // a small bare number means hours
    assert.equal(parseDuration("90"), 90); // a larger one means minutes
    assert.equal(parseDuration("2 hours 5 min"), 125);
    assert.equal(parseDuration(""), null);
    assert.equal(parseDuration("soon"), null);
  });

  it("shortens titled names for headlines", () => {
    assert.equal(shortName("Prof. Anita Mehta"), "Prof. Mehta");
    assert.equal(shortName("Dr Sam Rivera Lopez"), "Dr Lopez");
    assert.equal(shortName("Riya Gupta"), "Riya Gupta");
  });
});
