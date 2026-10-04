import type { ChapterId, TourId } from "./state";

/** What a tour needs to know about the account and the page it starts on. */
export interface TourContext {
  role: "student" | "professor";
  phone: boolean;
  hasProfessor: boolean;
  /** The project on screen, else the first one; null when there is none. */
  projectId: string | null;
  /** The task on screen, else a recent one. */
  taskId: string | null;
  /** A project with remarks to show, for the feedback tour. */
  remarksProjectId: string | null;
  /** Monday of the current week, for the weekly report. */
  weekStart: string;
  /** A report worth touring: the student's current week, or a student's submitted report for a professor. */
  reportPath: string | null;
  installed: boolean;
  /** The path the tour was started on. */
  here: string;
}

export interface TourStep {
  id: string;
  /** Eyebrow on the card. */
  chapter: string;
  /**
   * `data-tour` key(s) of the element to highlight, space-separated. Missing:
   * a centred card. A target that isn't on screen skips the step.
   */
  target?: string;
  /** Highlight every match as one area (a table column) instead of the first. */
  union?: boolean;
  /** The page this step lives on; null skips the step. Omitted: wherever the user is. */
  route?: (c: TourContext) => string | null;
  title: string;
  text: string;
  why?: string;
  /** Phones: one sentence, at most 110 characters; the why-line is dropped. */
  short: string;
  /** An action step: a button that does the thing. */
  action?: { kind: "log" | "install"; label: string };
  /** Opens the New task dialog first. */
  inDialog?: "new-task";
  /** Already covered by the core tour; skipped when a chapter plays by itself. */
  core?: boolean;
  /** Sample rows shown when the highlighted section is still empty. */
  preview?: string[];
  /** Bounce the target on arrival (action targets). */
  bounce?: boolean;
}

const dashboard = () => "/dashboard";
const project = (c: TourContext) => (c.projectId ? `/projects/${c.projectId}` : null);
const projectTasks = (c: TourContext) => (c.projectId ? `/projects/${c.projectId}/tasks` : null);
const task = (c: TourContext) => (c.taskId ? `/tasks/${c.taskId}` : null);

// ───────────────────────────── core tour ─────────────────────────────

function coreStudent(c: TourContext): TourStep[] {
  const steps: TourStep[] = [
    {
      id: "s1",
      chapter: "Dashboard",
      target: "next-action",
      route: dashboard,
      title: "Start every day here",
      text: "ResearchFlow picks the one thing that matters most right now: an overdue task, your professor's request, or today's log.",
      why: "You never have to decide what to work on first. Press Enter on the dashboard to open it.",
      short: "The one thing that matters most right now, chosen for you.",
    },
    {
      id: "s2",
      chapter: "Dashboard",
      target: "overdue",
      route: dashboard,
      title: "Overdue can't be snoozed",
      text: "Anything past its deadline stays here, in red, until it's done or the deadline is formally moved.",
      why: "Late work stays visible. That's the point.",
      short: "Late work stays here, in red, until it's done or the deadline is formally moved.",
      preview: ["Measure efficiency at 4 load points · 2d late", "Fix gate-driver PCB layout · 1d late"],
    },
    {
      id: "s3",
      chapter: "Dashboard",
      target: "focus",
      route: dashboard,
      title: "Today's focus",
      text: "Tasks due today and work you've already started. Keep this list short and finish what's on it.",
      why: "Finished work counts. Started work doesn't.",
      short: "Due today, plus work you've started. Keep it short and finish it.",
      preview: ["Write the literature review · Due today", "Tune the PI controller gains · In progress"],
    },
    {
      id: "s4",
      chapter: "Dashboard",
      target: "next7",
      route: dashboard,
      title: "The week ahead",
      text: "Every deadline and milestone in the next seven days. Calendar shows the full month.",
      why: "No deadline should come as a surprise.",
      short: "Every deadline and milestone in the next seven days.",
      preview: ["◆ Milestone: Hardware prototype · Fri", "Plot efficiency vs load · Mon"],
    },
    c.hasProfessor
      ? {
          id: "s5",
          chapter: "Dashboard",
          target: "feedback",
          route: dashboard,
          title: "Your professor's requests",
          text: "Change requests and questions land here. Reply, mark them addressed, or turn them into tasks in one click.",
          why: "Feedback that becomes a task gets done. Feedback left in a message gets forgotten.",
          short: "Change requests and questions land here. Turn them into tasks in one click.",
          preview: ["Change request · Add the efficiency curve at light load", "Question · Which switching frequency did Fig. 3 use?"],
        }
      : {
          id: "s5",
          chapter: "Dashboard",
          target: "join-professor",
          route: dashboard,
          title: "Link your professor",
          text: "Until you do, deadlines have no owner and nobody reviews your work.",
          why: "Enter your professor's 8-character join code here.",
          short: "Until you link your professor, deadlines have no owner and nobody reviews your work.",
        },
    {
      id: "s6",
      chapter: "Project",
      target: "project-tabs",
      route: project,
      title: "Your project, in one place",
      text: "Milestones, tasks, timeline, daily logs, feedback and files. Each tab is one part of the work.",
      why: "Everything your professor will ask about is in here.",
      short: "Milestones, tasks, logs, feedback and files. Each tab is one part of the work.",
    },
    {
      id: "s7",
      chapter: "Project · Tasks",
      target: "new-task",
      route: projectTasks,
      title: "Every task gets a deadline",
      text: "Create tasks you can finish in a few days. Your professor sets the hard deadline; you can set an earlier one for yourself.",
      why: "A task without a deadline is only a wish. Press C to create one.",
      short: "Create tasks you can finish in a few days, and give every task a deadline.",
      bounce: true,
    },
    {
      id: "s8",
      chapter: "Daily log",
      target: "log-button",
      title: "Your daily work journal",
      text: "Once a day, write what you completed, what went wrong, and what's next. It takes about a minute.",
      why: "Your log is the evidence. It shows real progress even when results aren't in yet.",
      short: "Once a day, write what you did, what failed and what's next. About a minute.",
      action: { kind: "log", label: "Write my first log" },
      bounce: true,
    },
  ];
  if (c.phone) {
    steps.push({
      id: "s9",
      chapter: "More",
      target: "more-button",
      title: "Reports and help are in More",
      text: "Every week ResearchFlow builds a report from your logs and tasks. Tours and help are under More → Help & tours.",
      short: "Your weekly report and Help & tours are under More.",
    });
    if (!c.installed) steps.push(installStep());
  } else {
    steps.push(
      {
        id: "s9",
        chapter: "Weekly report",
        target: "nav-reports",
        title: "Your weekly report writes itself",
        text: "Every week, ResearchFlow builds a report from your logs and tasks. Add a short note, submit it, and bring it to your meeting.",
        why: "No last-minute report writing. The record is already there.",
        short: "Every week a report is built from your logs and tasks.",
      },
      helpStep("s10"),
    );
  }
  return steps;
}

function coreProfessor(c: TourContext): TourStep[] {
  const steps: TourStep[] = [
    {
      id: "p1",
      chapter: "Dashboard",
      target: "students",
      route: dashboard,
      title: "Sorted by who needs you",
      text: "Students are ordered by how urgently they need attention: missed deadlines, blockers, quiet days. Start at the top row.",
      why: "Five minutes here replaces a round of status emails.",
      short: "Students are ordered by who needs you most. Start at the top.",
    },
    {
      id: "p2",
      chapter: "Dashboard",
      target: "health",
      union: true,
      route: dashboard,
      title: "Health you don't have to ask about",
      text: "On track, At risk or Missed a deadline. Health is calculated from deadlines and logs, not from what anyone reports.",
      why: "An objective status, without awkward check-ins.",
      short: "Health comes from deadlines and logs, not from what anyone reports.",
    },
    {
      id: "p3",
      chapter: "Dashboard",
      target: "activity",
      union: true,
      route: dashboard,
      title: "Quiet is a signal",
      text: "See who logged this week and who has gone quiet for three days or more.",
      why: "You notice drift within days, not at the next meeting.",
      short: "See who logged this week and who has gone quiet for three days or more.",
    },
    {
      id: "p4",
      chapter: "Dashboard",
      target: "review-queue",
      route: dashboard,
      title: "Approve with evidence",
      text: "Students submit tasks with their evidence attached: logs, files and links. Approve, or request changes with a comment.",
      why: "Nothing counts as done until you've seen the proof. Keys: A approve, R request changes.",
      short: "Students submit tasks with evidence. Approve, or request changes with a comment.",
      preview: ["Measure efficiency at 4 load points · Riya · 2 pieces of evidence"],
    },
    {
      id: "p5",
      chapter: "Dashboard",
      target: "blockers",
      route: dashboard,
      title: "Unblock first",
      text: "When a student is stuck, it shows here. A quick answer often saves a week.",
      why: "Blocked time is the most expensive time in research.",
      short: "When a student is stuck, it shows here. A quick answer often saves a week.",
      preview: ["Oscilloscope probe broken · Arjun · high"],
    },
    {
      id: "p6",
      chapter: "Dashboard",
      target: "join-code",
      route: dashboard,
      title: "Add students with your code",
      text: "Students enter this code in Settings to link to you. Replace it any time; the old code stops working.",
      why: "Only students who have your code can reach you.",
      short: "Students enter this code to link to you.",
    },
    c.projectId
      ? {
          id: "p7",
          chapter: "Project",
          target: "milestones",
          route: project,
          title: "You own the deadlines",
          text: "Milestones and professor deadlines are yours to set. Students can't move them; they request an extension and you decide.",
          why: "A deadline only works if nobody can move it quietly.",
          short: "Milestones and professor deadlines are yours. Students request extensions; you decide.",
        }
      : {
          id: "p7",
          chapter: "Projects",
          target: "new-project",
          title: "Create your first project",
          text: "Create a project, or wait for a student to add you to theirs.",
          why: "Deadlines and reviews live inside projects.",
          short: "Create a project, or wait for a student to add you to theirs.",
        },
    {
      id: "p8",
      chapter: "Project",
      target: "tab-remarks",
      route: project,
      title: "Feedback that can't get lost",
      text: "Choose Change request when something must be fixed. It stays open until the student addresses it, and they can turn it into tasks.",
      why: "What you said in a meeting is still on record a month later.",
      short: "A Change request stays open until the student addresses it.",
    },
    {
      id: "p9",
      chapter: "Weekly report",
      target: "nav-reports",
      title: "Weekly reports, ready to read",
      text: "Each student's week is summarised from their logs and tasks. Read it, then press Acknowledge so they know you've seen it.",
      why: "You prepare for a meeting in two minutes.",
      short: "Each student's week, summarised. Read it, then Acknowledge it.",
    },
  ];
  if (c.phone) {
    steps.push({
      id: "p10",
      chapter: "Help",
      target: "more-button",
      title: "Replay anytime",
      text: "Tours and help are under More → Help & tours.",
      short: "Tours and help are under More → Help & tours.",
    });
    if (!c.installed) steps.push(installStep());
  } else {
    steps.push(helpStep("p10"));
  }
  return steps;
}

function helpStep(id: string): TourStep {
  return {
    id,
    chapter: "Help",
    target: "help-button",
    title: "Replay anytime",
    text: "Tours and keyboard shortcuts are in this menu. Press ? to see every shortcut.",
    why: "You can always check how something works instead of guessing.",
    short: "Tours and keyboard shortcuts are in this menu.",
  };
}

function installStep(): TourStep {
  return {
    id: "install",
    chapter: "App",
    title: "Install ResearchFlow",
    text: "Add ResearchFlow to your home screen so reminders reach you.",
    short: "Add ResearchFlow to your home screen so reminders reach you.",
    action: { kind: "install", label: "Install" },
  };
}

// ───────────────────────────── chapters ─────────────────────────────

function dashboardChapter(c: TourContext): TourStep[] {
  if (c.role === "professor") return coreProfessor(c).slice(0, 6).map((s) => ({ ...s, core: true }));
  return [
    {
      id: "d1",
      chapter: "Dashboard",
      route: dashboard,
      title: "This is your command center",
      text: "Everything that needs you today is on this one page, ordered by urgency. Check it before you open anything else.",
      why: "One page, read top to bottom, is your whole plan for the day.",
      short: "Everything that needs you today, on one page, ordered by urgency.",
    },
    {
      id: "d2",
      chapter: "Dashboard",
      target: "next-action",
      route: dashboard,
      core: true,
      title: "Start every day here",
      text: "The single most important thing right now, with the reason. When you've done it, the next one takes its place.",
      why: "It removes the decision about where to start.",
      short: "The most important thing right now, with the reason.",
    },
    {
      id: "d3",
      chapter: "Dashboard",
      target: "overdue",
      route: dashboard,
      core: true,
      title: "Overdue can't be snoozed",
      text: "It stays until the task is done or your professor approves a new date. \"Request extension\" on the task is the honest way to move it.",
      why: "A slipped deadline is visible to both of you, so it gets dealt with.",
      short: "It stays until the task is done or your professor approves a new date.",
      preview: ["Measure efficiency at 4 load points · 2d late"],
    },
    {
      id: "d4",
      chapter: "Dashboard",
      target: "focus",
      route: dashboard,
      core: true,
      title: "Today's focus",
      text: "Due today, plus anything you've already started. If it's here, it should move today.",
      why: "A short list gets finished. A long one gets avoided.",
      short: "Due today, plus anything you've started. If it's here, it should move today.",
      preview: ["Write the literature review · Due today"],
    },
    {
      id: "d5",
      chapter: "Dashboard",
      target: "next7",
      route: dashboard,
      core: true,
      title: "Upcoming deadlines",
      text: "◆ marks a milestone. \"PROF\" deadlines are set by your professor; your own deadlines show as dashed.",
      why: "You see the crunch coming and start early.",
      short: "◆ marks a milestone. PROF deadlines are your professor's; yours are dashed.",
      preview: ["◆ Milestone: Preliminary results · Fri"],
    },
    {
      id: "d6",
      chapter: "Dashboard",
      target: "projects",
      route: dashboard,
      title: "Project progress",
      text: "Each project shows its health, how much is done and the next milestone. Health turns amber or red on its own when deadlines slip.",
      why: "You see trouble the moment it starts.",
      short: "Health, progress and the next milestone. Health turns red on its own when deadlines slip.",
    },
    {
      id: "d7",
      chapter: "Dashboard",
      target: "this-week",
      route: dashboard,
      title: "Your logging week",
      text: "One bar per day you logged. Empty days are listed underneath.",
      why: "Your professor sees exactly the same chart.",
      short: "One bar per day you logged. Your professor sees the same chart.",
    },
  ];
}

function projectChapter(): TourStep[] {
  return [
    {
      id: "pr1",
      chapter: "Project",
      target: "project-header",
      route: project,
      title: "Project overview",
      text: "Health, progress, open and finished tasks, and the next professor deadline, all in one line.",
      why: "You can tell where the project stands in five seconds.",
      short: "Health, progress and the next professor deadline in one line.",
    },
    {
      id: "pr2",
      chapter: "Project",
      target: "milestones",
      route: project,
      title: "Milestones are checkpoints",
      text: "Big steps like \"Preliminary results\" or \"Paper draft\". Your professor sets their dates. Every task belongs to one.",
      why: "Milestones turn a long project into deadlines you can actually meet.",
      short: "Big checkpoints like \"Paper draft\". Your professor sets their dates.",
    },
    {
      id: "pr3",
      chapter: "Project",
      target: "tab-tasks",
      route: project,
      core: true,
      title: "Tasks: the work itself",
      text: "Board or list. Each task moves To do → In progress → In review → Done.",
      why: "Everyone sees the same state, so nobody has to ask.",
      short: "Each task moves To do → In progress → In review → Done.",
    },
    {
      id: "pr4",
      chapter: "Project",
      target: "tab-timeline",
      route: project,
      title: "Timeline",
      text: "Milestones and tasks on one line through time, with today marked.",
      why: "A schedule that doesn't fit shows up here before it fails.",
      short: "Milestones and tasks through time, with today marked.",
    },
    {
      id: "pr5",
      chapter: "Project",
      target: "tab-logs",
      route: project,
      title: "Progress logs",
      text: "Every daily entry for this project, newest first. Your professor can comment on any entry.",
      why: "This is the project's diary of real work.",
      short: "Every daily entry for this project. Your professor can comment on any of them.",
    },
    {
      id: "pr6",
      chapter: "Project",
      target: "tab-files",
      route: project,
      title: "Files and links",
      text: "Every file and link attached anywhere in the project: waveform captures, schematics, PCB files, simulations, drafts.",
      why: "Evidence you can open, not evidence you describe.",
      short: "Every file and link attached anywhere in the project.",
    },
    {
      id: "pr7",
      chapter: "Project",
      target: "tab-remarks",
      route: project,
      title: "Remarks",
      text: "Your professor's feedback on this project. Open change requests and questions show \"Needs a response\" until you answer.",
      why: "Feedback lives with the work, not in your inbox.",
      short: "Your professor's feedback. Open requests show \"Needs a response\" until you answer.",
    },
    {
      id: "pr8",
      chapter: "Project",
      target: "tab-blockers tab-decisions",
      union: true,
      route: project,
      title: "Blockers and decisions",
      text: "Raise a blocker the moment you're stuck. Record decisions and their reasons so nobody re-argues them later.",
      why: "Stuck work and settled questions both stay visible. Press [ and ] to switch tabs.",
      short: "Raise a blocker the moment you're stuck. Record decisions so nobody re-argues them.",
    },
  ];
}

function tasksChapter(c: TourContext): TourStep[] {
  const prof = c.role === "professor";
  return [
    {
      id: "t1",
      chapter: "Tasks",
      target: "new-task",
      route: projectTasks,
      core: true,
      title: "Create a task",
      text: "Name it so anyone can tell when it's done: \"Add the efficiency-vs-load curve to Fig. 5\", not \"Improve results\".",
      why: "A vague task never finishes. Press C anywhere in a project.",
      short: "Name it so anyone can tell when it's done.",
      bounce: true,
    },
    {
      id: "t2",
      chapter: "Tasks",
      target: "nt-prof-deadline",
      inDialog: "new-task",
      route: projectTasks,
      title: "The professor deadline",
      text: prof ? "You set it, and students can't move it. This is the date that counts." : "Set by your professor and locked for you. This is the date that counts.",
      why: "One owner per deadline, so nobody can quietly move it.",
      short: prof ? "You set it; students can't move it." : "Set by your professor and locked for you. This is the date that counts.",
    },
    {
      id: "t3",
      chapter: "Tasks",
      target: "nt-my-deadline",
      inDialog: "new-task",
      route: projectTasks,
      title: "Your own deadline",
      text: "Set an earlier date for yourself. It can't be later than the professor deadline.",
      why: "Finishing early leaves time for review and changes.",
      short: "Set an earlier date for yourself, before the professor deadline.",
    },
    {
      id: "t4",
      chapter: "Tasks",
      target: "status-panel",
      route: task,
      title: "Status moves forward",
      text: "Start working → Submit for review → Done. If your professor requests changes, the task comes back to you with their remarks.",
      why: "The status is the truth, and both of you see it.",
      short: "Start working → Submit for review → Done.",
    },
    {
      id: "t5",
      chapter: "Tasks",
      target: "evidence",
      route: task,
      title: "No evidence, no submit",
      text: "Link a log entry or attach a file or link before you submit.",
      why: "Professors approve proof, not claims.",
      short: "Link a log or attach a file before you submit. Professors approve proof.",
    },
    {
      id: "t6",
      chapter: "Tasks",
      target: "dependencies",
      route: task,
      title: "Dependencies",
      text: "If this task can't finish before another one, add that task here. It can't be submitted until its dependencies are done.",
      why: "The order of work is shown on screen instead of being remembered.",
      short: "A task can't be submitted until the tasks it depends on are done.",
    },
    {
      id: "t7",
      chapter: "Tasks",
      target: "extension",
      route: task,
      title: prof ? "Extensions come to you" : "Need more time? Ask openly",
      text: prof ? "Students propose a new date and give a reason. You approve it or keep the deadline." : "Propose a new date and give a reason. Your professor approves it or keeps the deadline.",
      why: prof ? "Every moved deadline has a reason on record." : "Asking early is accountable. Missing the date silently is not.",
      short: prof ? "Students propose a new date with a reason; you decide." : "Propose a new date with a reason. Your professor decides.",
    },
  ];
}

function logChapter(): TourStep[] {
  // The composer: the sheet, or the form on the desktop log page (phones have no form there).
  const sheet = (c: TourContext) => (c.here === "/log/new" || (c.here === "/log" && !c.phone) ? c.here : "/log/new");
  return [
    {
      id: "l1",
      chapter: "Progress log",
      target: "log-form",
      route: sheet,
      title: "This is your daily work journal",
      text: "One entry per project per day, written in plain words. Your professor reads it; nobody grades the writing.",
      why: "A minute a day turns into a record of every week of your research.",
      short: "One entry per project per day, in plain words. Your professor reads it.",
    },
    {
      id: "l2",
      chapter: "Progress log",
      target: "log-day",
      route: sheet,
      title: "Today, or catch up two days",
      text: "You can log for today, yesterday or two days ago. Older days are locked.",
      why: "Logs written the same day are accurate. Logs reconstructed weeks later are fiction.",
      short: "Log today, yesterday or two days ago. Older days are locked.",
    },
    {
      id: "l3",
      chapter: "Progress log",
      target: "log-done",
      route: sheet,
      title: "Work done",
      text: "Concrete and specific: \"Ran the converter at 50 kHz: 92% efficiency at full load, 85% at 20% load.\"",
      why: "Specific work is believable. \"Worked on experiments\" is not.",
      short: "Be specific. \"Worked on experiments\" isn't believable.",
    },
    {
      id: "l4",
      chapter: "Progress log",
      target: "log-problems",
      route: sheet,
      title: "Problems",
      text: "What didn't work and why, if you know. Failed tests count as progress here.",
      why: "A problem your professor sees early is a problem they can help with.",
      short: "What didn't work, and why. Failed tests count as progress.",
    },
    {
      id: "l5",
      chapter: "Progress log",
      target: "log-next",
      route: sheet,
      title: "Next steps",
      text: "What you'll do next. Tomorrow, ResearchFlow shows it back to you as \"Yesterday you planned…\".",
      why: "Today's plan becomes tomorrow's checklist.",
      short: "What you'll do next. Tomorrow it comes back as \"Yesterday you planned…\".",
    },
    {
      id: "l6",
      chapter: "Progress log",
      target: "log-time",
      route: sheet,
      title: "Time spent",
      text: "Type it the way you'd say it, like \"2h 30m\", or tap +30m, +1h or +2h.",
      why: "Hours add up to your weekly total on the report.",
      short: "Type \"2h 30m\", or tap +30m, +1h or +2h.",
    },
    {
      id: "l7",
      chapter: "Progress log",
      target: "log-evidence",
      route: sheet,
      title: "Link the tasks it moved",
      text: "Tick the tasks this work was for. The entry becomes evidence on each one.",
      why: "Linked logs are what let you submit a task for review.",
      short: "Link the tasks this work was for. It becomes their evidence.",
    },
    {
      id: "l8",
      chapter: "Progress log",
      target: "log-attach",
      route: sheet,
      title: "Attach the proof",
      text: "Save first, then attach plots, notebooks, drafts or links to this entry.",
      why: "A screenshot of the result beats a sentence about it.",
      short: "Save first, then attach plots, drafts or links.",
    },
    {
      id: "l9",
      chapter: "Progress log",
      target: "log-record",
      route: () => "/log",
      title: "Your record, at a glance",
      text: "Every day you logged, and every gap. Press N from anywhere to write today's entry.",
      why: "Consistency is visible. Make it something you're proud to show.",
      short: "Every day you logged, and every gap.",
    },
  ];
}

function feedbackChapter(c: TourContext): TourStep[] {
  const where = (x: TourContext) => {
    if (/^\/projects\/[^/]+\/remarks$/.test(x.here) || /^\/tasks\/[^/]+$/.test(x.here)) return x.here;
    const id = x.remarksProjectId ?? x.projectId;
    return id ? `/projects/${id}/remarks` : null;
  };
  if (c.role === "professor") {
    return [
      {
        id: "f1",
        chapter: "Feedback",
        target: "remark-kinds",
        route: where,
        title: "Choose the kind",
        text: "Comment, Question, Change request or Approved. Choose Change request when something must be fixed.",
        why: "The kind tells the student instantly whether action is needed.",
        short: "Choose Change request when something must be fixed.",
      },
      {
        id: "f2",
        chapter: "Feedback",
        target: "needs-response",
        route: where,
        title: "It stays open until addressed",
        text: "Questions and change requests stay open, and stay on the student's dashboard, until they respond.",
        why: "Nothing you ask for can slip past.",
        short: "Requests stay open on the student's dashboard until they respond.",
      },
      {
        id: "f3",
        chapter: "Feedback",
        target: "remark",
        route: where,
        title: "Students can turn it into tasks",
        text: "One click turns your remark into a task with a deadline, with your words quoted inside.",
        why: "Feedback with a deadline gets done.",
        short: "One click turns your remark into a task with a deadline.",
      },
    ];
  }
  return [
    {
      id: "f1",
      chapter: "Feedback",
      target: "remark-kind",
      route: where,
      title: "How feedback arrives",
      text: "Your professor writes on a task, a log entry or the project, and chooses a kind: Comment, Question, Change request or Approved.",
      why: "The kind tells you instantly whether action is needed.",
      short: "The kind (Comment, Question, Change request) tells you if action is needed.",
    },
    {
      id: "f2",
      chapter: "Feedback",
      target: "needs-response",
      route: where,
      title: "Open until answered",
      text: "Questions and change requests stay open, and stay on your dashboard, until you respond.",
      why: "Nothing your professor asks for can slip past.",
      short: "Requests stay open, and on your dashboard, until you respond.",
    },
    {
      id: "f3",
      chapter: "Feedback",
      target: "remark-convert",
      route: where,
      title: "Turn feedback into work",
      text: "One click creates a task with the remark quoted inside. If the remark asks for several things, split it into several tasks with AI.",
      why: "Feedback with a deadline gets done.",
      short: "One click turns a remark into a task. AI can split it into several.",
    },
    {
      id: "f4",
      chapter: "Feedback",
      target: "remark-actions",
      route: where,
      title: "Close the loop",
      text: "Reply, and tick \"This reply addresses it\" when you've handled it. Your professor can reopen it.",
      why: "Both of you know the point is settled.",
      short: "Reply and mark it addressed. Your professor can reopen it.",
    },
    {
      id: "f5",
      chapter: "Feedback",
      target: "changes-requested",
      route: where,
      title: "Review feedback lands on the task",
      text: "When your professor requests changes during review, the comment becomes a change request on that task. Fix it, then submit again.",
      why: "The reason a task bounced is always written down.",
      short: "Requested changes land on the task. Fix them, then submit again.",
    },
  ];
}

function reportChapter(c: TourContext): TourStep[] {
  const where = (x: TourContext) => (/^\/reports\/\d{4}-\d{2}-\d{2}/.test(x.here) ? x.here : (x.reportPath ?? `/reports/${x.weekStart}`));
  if (c.role === "professor") {
    return [
      {
        id: "r1",
        chapter: "Weekly report",
        target: "report-summary",
        route: where,
        title: "Written from facts",
        text: "Tasks finished, deadlines missed, hours logged, problems and next week's plan, all taken from the student's logs and tasks.",
        why: "No rose-tinted summaries.",
        short: "Built from the student's logs and tasks, not from memory.",
      },
      {
        id: "r4",
        chapter: "Weekly report",
        target: "report-pdf",
        route: where,
        title: "Bring it to the meeting",
        text: "Download a PDF to read or annotate before you meet.",
        why: "The meeting starts from the same page for everyone.",
        short: "Download a PDF for the meeting.",
      },
      {
        id: "r5",
        chapter: "Weekly report",
        target: "report-ack",
        route: where,
        title: "Acknowledge it",
        text: "Press Acknowledge once you've read it. The student sees \"Acknowledged\".",
        why: "They know their update reached you.",
        short: "Acknowledge it so the student knows you've read it.",
      },
    ];
  }
  return [
    {
      id: "r1",
      chapter: "Weekly report",
      target: "report-summary",
      route: where,
      title: "Written for you, from facts",
      text: "Tasks finished, deadlines missed, hours logged, problems and next week's plan, all taken from your logs and tasks.",
      why: "No last-minute report writing, and no rose-tinted summaries.",
      short: "Built from your logs and tasks: finished, missed, hours, problems, plan.",
    },
    {
      id: "r2",
      chapter: "Weekly report",
      target: "report-note",
      route: where,
      title: "Add your note",
      text: "Two or three sentences: what moved, what's stuck, what you need. Draft with AI writes a first version from the week's data.",
      why: "The numbers say what happened. Your note says what it means.",
      short: "Two or three sentences: what moved, what's stuck, what you need.",
    },
    {
      id: "r3",
      chapter: "Weekly report",
      target: "report-submit",
      route: where,
      title: "Submit freezes it",
      text: "Until you submit, the report updates as you log. Submitting saves it permanently as that week's record.",
      why: "A record that can't be edited later is one people trust.",
      short: "Submitting saves it permanently as that week's record.",
    },
    {
      id: "r4",
      chapter: "Weekly report",
      target: "report-pdf report-share",
      union: true,
      route: where,
      title: "Bring it to the meeting",
      text: "Download a PDF, or share a read-only link with anyone, such as a co-supervisor.",
      why: "The meeting starts from the same page for everyone.",
      short: "Download a PDF, or share a read-only link.",
    },
    {
      id: "r5",
      chapter: "Weekly report",
      target: "report-status",
      route: where,
      title: "Seen and acknowledged",
      text: "When your professor reads it, the report shows \"Acknowledged\".",
      why: "You know your update reached them.",
      short: "When your professor reads it, it shows \"Acknowledged\".",
    },
  ];
}

function calendarChapter(): TourStep[] {
  const cal = () => "/calendar";
  return [
    {
      id: "c1",
      chapter: "Calendar",
      target: "cal-grid",
      route: cal,
      title: "Every deadline, visually",
      text: "Solid \"PROF\" chips are professor deadlines. Dashed \"ME\" chips are yours. ◆ marks a milestone.",
      why: "A crowded week is obvious at a glance.",
      short: "PROF chips are professor deadlines, dashed ME chips are yours, ◆ is a milestone.",
    },
    {
      id: "c2",
      chapter: "Calendar",
      target: "cal-logged",
      route: cal,
      title: "Days you logged",
      text: "A green dot marks every day with a log entry.",
      why: "Planning and doing, side by side.",
      short: "A green dot marks every day with a log entry.",
    },
    {
      id: "c3",
      chapter: "Calendar",
      target: "cal-mine",
      route: cal,
      title: "Plan ahead by dragging",
      text: "Drag your own deadlines to another day. Professor deadlines stay where they are.",
      why: "You can rearrange your plan without touching the commitments.",
      short: "Drag your own deadlines to another day.",
    },
    {
      id: "c4",
      chapter: "Calendar",
      target: "cal-view",
      route: cal,
      title: "Zoom to the week",
      text: "Week view shows every item in full. Use ← → to move and T for today.",
      why: "Monday planning takes one look.",
      short: "Week view shows every item in full.",
    },
  ];
}

/** The steps of a tour for this account and screen size. */
export function tourSteps(tour: TourId, c: TourContext): TourStep[] {
  switch (tour) {
    case "core":
      return c.role === "professor" ? coreProfessor(c) : coreStudent(c);
    case "dashboard":
      return dashboardChapter(c);
    case "project":
      return projectChapter();
    case "tasks":
      return tasksChapter(c);
    case "log":
      return c.role === "student" ? logChapter() : [];
    case "feedback":
      return feedbackChapter(c);
    case "report":
      return reportChapter(c);
    case "calendar":
      return calendarChapter();
  }
}

/** Which chapter "Tour this page" means on a path, if any. */
export function chapterForPath(path: string, role: "student" | "professor"): ChapterId | null {
  if (path === "/dashboard") return "dashboard";
  if (/^\/projects\/[^/]+\/tasks/.test(path) || /^\/tasks\/[0-9a-f-]{36}$/.test(path)) return "tasks";
  if (/^\/projects\/[^/]+\/remarks/.test(path)) return "feedback";
  if (/^\/projects\/[^/]+/.test(path) && path !== "/projects") return "project";
  if (path.startsWith("/log") && role === "student") return "log";
  if (/^\/reports\/\d{4}-\d{2}-\d{2}/.test(path)) return "report";
  if (path === "/calendar") return "calendar";
  return null;
}

/** Step ids of the parts a chapter can play on its own. */
export const PARTS: Record<string, { tour: ChapterId; ids: string[] }> = {
  "tasks-dialog": { tour: "tasks", ids: ["t2", "t3"] },
  "tasks-page": { tour: "tasks", ids: ["t4", "t5", "t6", "t7"] },
};
