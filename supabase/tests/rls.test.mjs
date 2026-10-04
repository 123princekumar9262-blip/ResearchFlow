// Database rule tests: each test acts as a real signed-in user against the real
// migrations, and tries to do what the product says must be impossible.
//
//   npm run test:db

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createDb, signUp, as, one, rows, expectError } from "./harness.mjs";

let db;
let prof, riya, arjun, outsider;
let project;

const today = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

before(async () => {
  db = await createDb();
  prof = await signUp(db, { name: "Prof Mehta", role: "professor" });
  riya = await signUp(db, { name: "Riya Gupta", role: "student" });
  arjun = await signUp(db, { name: "Arjun Singh", role: "student" });
  outsider = await signUp(db, { name: "Eve Outsider", role: "student" });
});

describe("profiles and supervision", () => {
  it("gives professors a join code and students none", async () => {
    const p = await one(db, "select join_code from profiles where id = $1", [prof]);
    const s = await one(db, "select join_code from profiles where id = $1", [riya]);
    assert.match(p.join_code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.equal(s.join_code, null);
  });

  it("hides a professor from a student until they link", async () => {
    const seen = await as(db, riya, (tx) => rows(tx, "select id from profiles where id = $1", [prof]));
    assert.equal(seen.length, 0);
  });

  it("rejects a wrong join code", async () => {
    await expectError(
      () => as(db, riya, (tx) => tx.query("select join_professor('NOPE1234')")),
      /No professor has that code/,
    );
  });

  it("links with a code typed in lowercase with a dash", async () => {
    const { join_code } = await one(db, "select join_code from profiles where id = $1", [prof]);
    const typed = `${join_code.slice(0, 4)}-${join_code.slice(4)}`.toLowerCase();
    for (const student of [riya, arjun]) {
      await as(db, student, (tx) => tx.query("select join_professor($1)", [typed]));
    }
    const seen = await as(db, riya, (tx) => rows(tx, "select full_name from profiles where id = $1", [prof]));
    assert.equal(seen[0].full_name, "Prof Mehta");
  });

  it("lists linked people: the professor for a student, lab-mates too", async () => {
    const people = await as(db, riya, (tx) => rows(tx, "select full_name, role from linked_people()"));
    assert.deepEqual(people.map((p) => p.full_name).sort(), ["Arjun Singh", "Prof Mehta"]);
    const forProf = await as(db, prof, (tx) => rows(tx, "select full_name from linked_people()"));
    assert.equal(forProf.length, 2);
    const forOutsider = await as(db, outsider, (tx) => rows(tx, "select full_name from linked_people()"));
    assert.equal(forOutsider.length, 0);
  });

  it("does not let a professor use a join code", async () => {
    const { join_code } = await one(db, "select join_code from profiles where id = $1", [prof]);
    await expectError(
      () => as(db, prof, (tx) => tx.query("select join_professor($1)", [join_code])),
      /Only students/,
    );
  });

  it("does not let anyone change their role", async () => {
    await expectError(
      () => as(db, riya, (tx) => tx.query("update profiles set role = 'professor' where id = $1", [riya])),
      /role can't be changed/,
    );
  });

  it("rotates a join code only through the RPC", async () => {
    await expectError(
      () => as(db, prof, (tx) => tx.query("update profiles set join_code = 'AAAAAAAA' where id = $1", [prof])),
      /Regenerate code/,
    );
    const before = await one(db, "select join_code from profiles where id = $1", [prof]);
    const { regenerate_join_code: code } = await as(db, prof, (tx) => one(tx, "select regenerate_join_code()"));
    assert.notEqual(code, before.join_code);
  });
});

describe("projects and membership", () => {
  it("creates a project with a linked professor and teammate", async () => {
    const { create_project: id } = await as(db, riya, (tx) =>
      one(tx, "select create_project('GNN Pruning', 'Prune GNNs', current_date, null, $1)", [[prof, arjun]]),
    );
    project = id;
    const members = await as(db, riya, (tx) =>
      rows(tx, "select user_id, role from project_members where project_id = $1 order by role", [project]),
    );
    assert.equal(members.length, 3);
    assert.equal(members.find((m) => m.user_id === prof).role, "professor");
  });

  it("refuses to add someone you aren't linked with", async () => {
    await expectError(
      () => as(db, riya, (tx) => tx.query("select create_project('X', '', current_date, null, $1)", [[outsider]])),
      /lab-mates/,
    );
  });

  it("hides the project from outsiders entirely", async () => {
    const seen = await as(db, outsider, (tx) => rows(tx, "select id from projects where id = $1", [project]));
    assert.equal(seen.length, 0);
    await expectError(
      () =>
        as(db, outsider, (tx) =>
          tx.query("insert into tasks (project_id, title, created_by) values ($1, 'sneaky', $2)", [project, outsider]),
        ),
      /row-level security/,
    );
  });

  it("does not let a student remove the professor", async () => {
    await as(db, riya, (tx) =>
      tx.query("delete from project_members where project_id = $1 and user_id = $2", [project, prof]),
    );
    const still = await one(db, "select count(*)::int as n from project_members where project_id = $1", [project]);
    assert.equal(still.n, 3);
  });
});

describe("deadlines", () => {
  let task;

  before(async () => {
    task = (
      await as(db, prof, (tx) =>
        one(
          tx,
          `insert into tasks (project_id, title, created_by, assignee_id, professor_deadline)
           values ($1, 'Run baseline', $2, $3, $4) returning id, requires_review`,
          [project, prof, riya, daysFromNow(7)],
        ),
      )
    );
  });

  it("makes tasks reviewable when the project has a professor", () => {
    assert.equal(task.requires_review, true);
  });

  it("does not let a student set a professor deadline", async () => {
    await expectError(
      () =>
        as(db, riya, (tx) =>
          tx.query(
            "insert into tasks (project_id, title, created_by, professor_deadline) values ($1, 'mine', $2, $3)",
            [project, riya, daysFromNow(30)],
          ),
        ),
      /Only your professor can set a professor deadline/,
    );
  });

  it("does not let a student opt their own task out of review", async () => {
    const t = await as(db, riya, (tx) =>
      one(
        tx,
        "insert into tasks (project_id, title, created_by, requires_review) values ($1, 'quiet', $2, false) returning requires_review",
        [project, riya],
      ),
    );
    assert.equal(t.requires_review, true);
  });

  it("does not let a student move the professor deadline", async () => {
    await expectError(
      () => as(db, riya, (tx) => tx.query("update tasks set professor_deadline = $2 where id = $1", [task.id, daysFromNow(30)])),
      /Only your professor can move a professor deadline/,
    );
  });

  it("rejects a personal deadline after the professor's", async () => {
    await expectError(
      () => as(db, riya, (tx) => tx.query("update tasks set personal_deadline = $2 where id = $1", [task.id, daysFromNow(10)])),
      /tasks_personal_before_professor/,
    );
  });

  it("clamps the personal deadline when the professor pulls theirs earlier, and audits both", async () => {
    await as(db, riya, (tx) => tx.query("update tasks set personal_deadline = $2 where id = $1", [task.id, daysFromNow(5)]));
    await as(db, prof, (tx) => tx.query("update tasks set professor_deadline = $2 where id = $1", [task.id, daysFromNow(3)]));
    const t = await one(db, "select personal_deadline::text, effective_deadline::text from tasks where id = $1", [task.id]);
    assert.equal(t.personal_deadline, daysFromNow(3));
    assert.equal(t.effective_deadline, daysFromNow(3));
    const audit = await as(db, riya, (tx) =>
      rows(tx, "select field from deadline_changes where task_id = $1 order by id", [task.id]),
    );
    assert.deepEqual(
      audit.map((a) => a.field),
      ["personal", "professor", "personal"],
    );
  });
});

describe("evidence, dependencies and review", () => {
  let task, prereq, log;

  before(async () => {
    [task, prereq] = await as(db, prof, async (tx) => [
      await one(tx, "insert into tasks (project_id, title, created_by, assignee_id) values ($1, 'Ablation', $2, $3) returning id", [project, prof, riya]),
      await one(tx, "insert into tasks (project_id, title, created_by, assignee_id) values ($1, 'Data split', $2, $3) returning id", [project, prof, riya]),
    ]);
    await as(db, riya, (tx) =>
      tx.query("insert into task_dependencies (task_id, depends_on_id) values ($1, $2)", [task.id, prereq.id]),
    );
  });

  it("rejects a dependency cycle", async () => {
    await expectError(
      () => as(db, riya, (tx) => tx.query("insert into task_dependencies (task_id, depends_on_id) values ($1, $2)", [prereq.id, task.id])),
      /cycle/,
    );
  });

  it("refuses to submit for review without evidence", async () => {
    await expectError(
      () => as(db, riya, (tx) => tx.query("update tasks set status = 'in_review' where id = $1", [task.id])),
      /Add evidence first/,
    );
  });

  it("refuses to submit while a dependency is open, even with evidence", async () => {
    log = await as(db, riya, async (tx) => {
      const l = await one(
        tx,
        `insert into progress_logs (project_id, author_id, log_date, completed_work, minutes_spent)
         values ($1, $2, current_date, 'Ran 4 configs', 150) returning id`,
        [project, riya],
      );
      await tx.query("insert into progress_log_tasks (log_id, task_id) values ($1, $2)", [l.id, task.id]);
      return l;
    });
    await expectError(
      () => as(db, riya, (tx) => tx.query("update tasks set status = 'in_review' where id = $1", [task.id])),
      /Finish the dependency "Data split"/,
    );
  });

  it("submits once the dependency is approved, stamping submitted_at", async () => {
    await as(db, riya, (tx) =>
      tx.query(
        "insert into attachments (project_id, uploader_id, kind, name, url, task_id) values ($1, $2, 'link', 'commit', 'https://github.com/x/y/commit/1', $3)",
        [project, riya, prereq.id],
      ),
    );
    await as(db, riya, (tx) => tx.query("update tasks set status = 'in_review' where id = $1", [prereq.id]));
    await as(db, prof, (tx) => tx.query("select review_task($1, true, '')", [prereq.id]));
    await as(db, riya, (tx) => tx.query("update tasks set status = 'in_review' where id = $1", [task.id]));
    const t = await one(db, "select status, submitted_at from tasks where id = $1", [task.id]);
    assert.equal(t.status, "in_review");
    assert.ok(t.submitted_at);
  });

  it("does not let the student approve their own work", async () => {
    await expectError(
      () => as(db, riya, (tx) => tx.query("update tasks set status = 'done' where id = $1", [task.id])),
      /approval|approve/,
    );
    await expectError(
      () => as(db, riya, (tx) => tx.query("select review_task($1, true, '')", [task.id])),
      /Only the project's professor/,
    );
  });

  it("protects evidence on a task under review", async () => {
    await as(db, riya, (tx) =>
      tx.query("delete from progress_log_tasks where log_id = $1 and task_id = $2", [log.id, task.id]),
    );
    const linked = await one(db, "select count(*)::int as n from progress_log_tasks where task_id = $1", [task.id]);
    assert.equal(linked.n, 1);
  });

  it("requires a reason to request changes", async () => {
    await expectError(
      () => as(db, prof, (tx) => tx.query("select review_task($1, false, '  ')", [task.id])),
      /Say what needs to change/,
    );
  });

  it("requests changes with a remark, then the remark becomes a prerequisite task", async () => {
    await as(db, prof, (tx) => tx.query("select review_task($1, false, 'Add the random-pruning baseline')", [task.id]));
    const t = await one(db, "select status from tasks where id = $1", [task.id]);
    assert.equal(t.status, "changes_requested");

    const remark = await one(db, "select id, kind, addressed_at from remarks where task_id = $1", [task.id]);
    assert.equal(remark.kind, "change_request");
    assert.equal(remark.addressed_at, null);

    const { convert_remark_to_task: revision } = await as(db, riya, (tx) =>
      one(tx, "select convert_remark_to_task($1, 'Add random baseline')", [remark.id]),
    );
    const r = await one(db, "select addressed_by from remarks where id = $1", [remark.id]);
    assert.equal(r.addressed_by, riya);
    const revisionTask = await one(db, "select assignee_id, source_remark_id from tasks where id = $1", [revision]);
    assert.equal(revisionTask.assignee_id, riya);
    assert.equal(revisionTask.source_remark_id, remark.id);

    await as(db, riya, (tx) => tx.query("update tasks set status = 'in_progress' where id = $1", [task.id]));
    await expectError(
      () => as(db, riya, (tx) => tx.query("update tasks set status = 'in_review' where id = $1", [task.id])),
      /Finish the dependency "Add random baseline"/,
    );
  });

  it("approval stamps completed_at and closes outstanding change requests", async () => {
    const [revision] = await rows(db, "select id from tasks where title = 'Add random baseline'");
    await as(db, riya, async (tx) => {
      await tx.query(
        "insert into attachments (project_id, uploader_id, kind, name, url, task_id) values ($1, $2, 'link', 'table v2', 'https://example.org/t', $3)",
        [project, riya, revision.id],
      );
      await tx.query("update tasks set status = 'in_review' where id = $1", [revision.id]);
    });
    await as(db, prof, (tx) => tx.query("select review_task($1, true, 'Good.')", [revision.id]));
    await as(db, riya, (tx) => tx.query("update tasks set status = 'in_review' where id = $1", [task.id]));
    await as(db, prof, (tx) => tx.query("select review_task($1, true, '')", [task.id]));
    const t = await one(db, "select status, completed_at from tasks where id = $1", [task.id]);
    assert.equal(t.status, "done");
    assert.ok(t.completed_at);
  });

  it("keeps evidence once the task is done", async () => {
    const [att] = await rows(db, "select id from attachments where task_id = $1", [prereq.id]);
    await as(db, riya, (tx) => tx.query("delete from attachments where id = $1", [att.id]));
    const still = await one(db, "select count(*)::int as n from attachments where id = $1", [att.id]);
    assert.equal(still.n, 1);
  });
});

describe("progress logs are an honest record", () => {
  it("rejects a backdated log", async () => {
    await expectError(
      () =>
        as(db, riya, (tx) =>
          tx.query(
            "insert into progress_logs (project_id, author_id, log_date, completed_work) values ($1, $2, current_date - 5, 'retro')",
            [project, riya],
          ),
        ),
      /row-level security/,
    );
  });

  it("rejects a log written in someone else's name", async () => {
    await expectError(
      () =>
        as(db, riya, (tx) =>
          tx.query(
            "insert into progress_logs (project_id, author_id, log_date, completed_work) values ($1, $2, current_date, 'for arjun')",
            [project, arjun],
          ),
        ),
      /row-level security/,
    );
  });

  it("locks logs after the grace window and never deletes them", async () => {
    const old = await one(
      db,
      "insert into progress_logs (project_id, author_id, log_date, completed_work) values ($1, $2, current_date - 10, 'old') returning id",
      [project, riya],
    );
    await as(db, riya, async (tx) => {
      await tx.query("update progress_logs set completed_work = 'rewritten' where id = $1", [old.id]);
      await tx.query("delete from progress_logs where id = $1", [old.id]);
    });
    const after = await one(db, "select completed_work from progress_logs where id = $1", [old.id]);
    assert.equal(after.completed_work, "old");
  });

  it("does not let a log change its date", async () => {
    const [mine] = await rows(db, "select id from progress_logs where author_id = $1 and log_date = current_date", [riya]);
    await expectError(
      () => as(db, riya, (tx) => tx.query("update progress_logs set log_date = current_date - 1 where id = $1", [mine.id])),
      /fixed once written/,
    );
  });
});

describe("remarks", () => {
  it("lets a student record a professor's request only as a meeting note", async () => {
    await expectError(
      () =>
        as(db, riya, (tx) =>
          tx.query("insert into remarks (project_id, author_id, kind, body) values ($1, $2, 'change_request', 'x')", [project, riya]),
        ),
      /row-level security/,
    );
    await as(db, riya, (tx) =>
      tx.query(
        "insert into remarks (project_id, author_id, kind, source, body) values ($1, $2, 'change_request', 'meeting', 'Prof: redo fig 3')",
        [project, riya],
      ),
    );
  });

  it("never lets a student post an approval", async () => {
    await expectError(
      () =>
        as(db, riya, (tx) =>
          tx.query("insert into remarks (project_id, author_id, kind, source, body) values ($1, $2, 'approval', 'meeting', 'ok')", [project, riya]),
        ),
      /row-level security/,
    );
  });

  it("does not allow editing a posted remark", async () => {
    const [r] = await rows(db, "select id from remarks where body = 'Prof: redo fig 3'");
    await expectError(
      () => as(db, prof, (tx) => tx.query("update remarks set body = 'softer' where id = $1", [r.id])),
      /can't be edited/,
    );
  });

  it("threads replies one level deep", async () => {
    const [r] = await rows(db, "select id from remarks where body = 'Prof: redo fig 3'");
    const reply = await as(db, prof, (tx) =>
      one(tx, "insert into remarks (project_id, author_id, parent_id, body) values ($1, $2, $3, 'Yes, log scale') returning id", [project, prof, r.id]),
    );
    await expectError(
      () =>
        as(db, riya, (tx) =>
          tx.query("insert into remarks (project_id, author_id, parent_id, body) values ($1, $2, $3, 'nested')", [project, riya, reply.id]),
        ),
      /original remark/,
    );
  });
});

describe("single-player mode", () => {
  let solo, task;

  it("lets a student without a professor own deadlines and close tasks with evidence", async () => {
    solo = (await as(db, outsider, (tx) => one(tx, "select create_project('Solo survey') as id"))).id;
    task = await as(db, outsider, async (tx) => {
      const t = await one(
        tx,
        "insert into tasks (project_id, title, created_by, professor_deadline) values ($1, 'Read 10 papers', $2, $3) returning id, requires_review",
        [solo, outsider, daysFromNow(5)],
      );
      await tx.query(
        "insert into attachments (project_id, uploader_id, kind, name, url, task_id) values ($1, $2, 'link', 'notes', 'https://notes.test/1', $3)",
        [solo, outsider, t.id],
      );
      return t;
    });
    assert.equal(task.requires_review, false);
    await as(db, outsider, (tx) => tx.query("update tasks set status = 'done' where id = $1", [task.id]));
  });

  it("hands deadlines and approval to the professor when one joins", async () => {
    const open = await as(db, outsider, (tx) =>
      one(tx, "insert into tasks (project_id, title, created_by, professor_deadline) values ($1, 'Write survey', $2, $3) returning id", [solo, outsider, daysFromNow(9)]),
    );
    const { join_code } = await one(db, "select join_code from profiles where id = $1", [prof]);
    await as(db, outsider, async (tx) => {
      await tx.query("select join_professor($1)", [join_code]);
      await tx.query("select add_project_member($1, $2)", [solo, prof]);
    });
    const t = await one(db, "select requires_review from tasks where id = $1", [open.id]);
    assert.equal(t.requires_review, true);
    const done = await one(db, "select requires_review from tasks where id = $1", [task.id]);
    assert.equal(done.requires_review, false, "finished work is not reopened");
    await expectError(
      () => as(db, outsider, (tx) => tx.query("update tasks set professor_deadline = $2 where id = $1", [open.id, daysFromNow(20)])),
      /Only your professor can move/,
    );
  });
});

describe("weekly reports", () => {
  let report;
  const monday = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();

  it("rejects a week that doesn't start on Monday", async () => {
    const tuesday = new Date(Date.parse(monday) + 86_400_000).toISOString().slice(0, 10);
    await expectError(
      () => as(db, riya, (tx) => tx.query("insert into weekly_reports (student_id, week_start) values ($1, $2)", [riya, tuesday])),
      /check constraint/,
    );
  });

  it("keeps a draft private from the professor until it is submitted", async () => {
    report = await as(db, riya, (tx) =>
      one(tx, "insert into weekly_reports (student_id, week_start, stats) values ($1, $2, '{\"tasksCompleted\": 2}') returning id, share_token", [riya, monday]),
    );
    const seen = await as(db, prof, (tx) => rows(tx, "select id from weekly_reports where id = $1", [report.id]));
    assert.equal(seen.length, 0);
  });

  it("freezes a report once submitted", async () => {
    await as(db, riya, (tx) => tx.query("update weekly_reports set student_note = 'Good week', submitted_at = now() where id = $1", [report.id]));
    await expectError(
      () => as(db, riya, (tx) => tx.query("update weekly_reports set student_note = 'Great week' where id = $1", [report.id])),
      /read-only/,
    );
  });

  it("lets the supervising professor acknowledge but not edit", async () => {
    await expectError(
      () => as(db, prof, (tx) => tx.query("update weekly_reports set student_note = 'edited' where id = $1", [report.id])),
      /Only the student/,
    );
    await as(db, prof, (tx) => tx.query("update weekly_reports set acknowledged_at = now() where id = $1", [report.id]));
    const r = await one(db, "select acknowledged_by from weekly_reports where id = $1", [report.id]);
    assert.equal(r.acknowledged_by, prof);
  });

  it("does not let the student acknowledge their own report", async () => {
    const other = await as(db, arjun, (tx) =>
      one(tx, "insert into weekly_reports (student_id, week_start, submitted_at) values ($1, $2, now()) returning id", [arjun, monday]),
    );
    await expectError(
      () => as(db, arjun, (tx) => tx.query("update weekly_reports set acknowledged_at = now() where id = $1", [other.id])),
      /Only your professor/,
    );
  });

  it("hides reports from people who don't supervise the student", async () => {
    const seen = await as(db, outsider, (tx) => rows(tx, "select id from weekly_reports where id = $1", [report.id]));
    assert.equal(seen.length, 0);
  });

  it("serves the public link only while sharing is on", async () => {
    const before = await as(db, null, (tx) => one(tx, "select get_shared_report($1) as r", [report.share_token]));
    assert.equal(before.r, null);
    await as(db, riya, (tx) => tx.query("update weekly_reports set share_enabled = true where id = $1", [report.id]));
    const after = await as(db, null, (tx) => one(tx, "select get_shared_report($1) as r", [report.share_token]));
    assert.equal(after.r.student_name, "Riya Gupta");
    assert.equal(after.r.stats.tasksCompleted, 2);
  });

  it("gives anonymous visitors nothing else", async () => {
    await expectError(() => as(db, null, (tx) => tx.query("select * from weekly_reports")), /permission denied/);
    await expectError(() => as(db, null, (tx) => tx.query("select * from projects")), /permission denied/);
  });
});

describe("storage", () => {
  it("lets members upload into their project's folder only", async () => {
    await as(db, riya, (tx) =>
      tx.query("insert into storage.objects (bucket_id, name, owner_id) values ('attachments', $1, $2)", [`${project}/a.pdf`, riya]),
    );
    await expectError(
      () =>
        as(db, outsider, (tx) =>
          tx.query("insert into storage.objects (bucket_id, name, owner_id) values ('attachments', $1, $2)", [`${project}/evil.pdf`, outsider]),
        ),
      /row-level security/,
    );
  });

  it("denies, rather than errors on, a malformed path", async () => {
    await expectError(
      () =>
        as(db, riya, (tx) =>
          tx.query("insert into storage.objects (bucket_id, name, owner_id) values ('attachments', 'not-a-uuid/x.pdf', $1)", [riya]),
        ),
      /row-level security/,
    );
  });

  it("hides other projects' files", async () => {
    const seen = await as(db, outsider, (tx) => rows(tx, "select name from storage.objects where name like $1", [`${project}/%`]));
    assert.equal(seen.length, 0);
  });
});

describe("extension requests", () => {
  let task, request;

  before(async () => {
    task = (
      await as(db, prof, (tx) =>
        one(tx, "insert into tasks (project_id, title, created_by, assignee_id, professor_deadline) values ($1, 'Write intro', $2, $3, $4) returning id", [project, prof, riya, daysFromNow(2)]),
      )
    ).id;
  });

  it("rejects a proposal that isn't later than the current deadline", async () => {
    await expectError(
      () => as(db, riya, (tx) => tx.query("insert into extension_requests (project_id, task_id, requested_by, proposed_deadline, reason) values ($1, $2, $3, $4, 'x')", [project, task, riya, daysFromNow(1)])),
      /after the current deadline/,
    );
  });

  it("allows one pending request per task, recording the current deadline", async () => {
    request = await as(db, riya, (tx) =>
      one(tx, "insert into extension_requests (project_id, task_id, requested_by, proposed_deadline, reason, status) values ($1, $2, $3, $4, 'GPU queue', 'approved') returning id, status, current_deadline::text", [project, task, riya, daysFromNow(6)]),
    );
    assert.equal(request.status, "pending", "a request can't be born approved");
    assert.equal(request.current_deadline, daysFromNow(2));
    await expectError(
      () => as(db, riya, (tx) => tx.query("insert into extension_requests (project_id, task_id, requested_by, proposed_deadline, reason) values ($1, $2, $3, $4, 'again')", [project, task, riya, daysFromNow(9)])),
      /extension_requests_one_pending/,
    );
  });

  it("lets only the professor decide, and never by editing the row", async () => {
    await expectError(() => as(db, riya, (tx) => tx.query("select respond_extension($1, true, '')", [request.id])), /Only the project's professor/);
    await as(db, riya, (tx) => tx.query("update extension_requests set status = 'approved' where id = $1", [request.id])).catch(() => {});
    const r = await one(db, "select status from extension_requests where id = $1", [request.id]);
    assert.equal(r.status, "pending");
    await expectError(() => as(db, prof, (tx) => tx.query("select respond_extension($1, false, ' ')", [request.id])), /Say why/);
  });

  it("approval moves the deadline as the professor, audits it, and posts the decision", async () => {
    await as(db, prof, (tx) => tx.query("select respond_extension($1, true, 'OK, cluster issue.')", [request.id]));
    const t = await one(db, "select professor_deadline::text from tasks where id = $1", [task]);
    assert.equal(t.professor_deadline, daysFromNow(6));
    const audit = await one(db, "select changed_by from deadline_changes where task_id = $1 and field = 'professor' order by id desc limit 1", [task]);
    assert.equal(audit.changed_by, prof);
    const remark = await one(db, "select body from remarks where task_id = $1 order by created_at desc limit 1", [task]);
    assert.match(remark.body, /^Extension approved: new deadline .* OK, cluster issue.$/);
    await expectError(() => as(db, prof, (tx) => tx.query("select respond_extension($1, true, '')", [request.id])), /already decided/);
  });

  it("lets the requester withdraw a pending request, and hides requests from outsiders", async () => {
    const r = await as(db, riya, (tx) =>
      one(tx, "insert into extension_requests (project_id, task_id, requested_by, proposed_deadline, reason) values ($1, $2, $3, $4, 'more seeds') returning id", [project, task, riya, daysFromNow(10)]),
    );
    const seen = await as(db, outsider, (tx) => rows(tx, "select id from extension_requests where id = $1", [r.id]));
    assert.equal(seen.length, 0);
    await as(db, riya, (tx) => tx.query("delete from extension_requests where id = $1", [r.id]));
    assert.equal((await one(db, "select count(*)::int as n from extension_requests where id = $1", [r.id])).n, 0);
  });
});

describe("comments on log entries", () => {
  let log;

  before(async () => {
    log = (
      await as(db, riya, (tx) =>
        one(tx, "insert into progress_logs (project_id, author_id, log_date, completed_work) values ($1, $2, current_date - 1, 'sweep done') returning id", [project, riya]),
      )
    ).id;
  });

  it("lets the professor comment on a student's entry, and the student reply on the same entry", async () => {
    const c = await as(db, prof, (tx) =>
      one(tx, "insert into remarks (project_id, progress_log_id, author_id, kind, body) values ($1, $2, $3, 'comment', 'Seeds or split?') returning id", [project, log, prof]),
    );
    const reply = await as(db, riya, (tx) =>
      one(tx, "insert into remarks (project_id, parent_id, author_id, kind, body) values ($1, $2, $3, 'comment', 'The split.') returning progress_log_id", [project, c.id, riya]),
    );
    assert.equal(reply.progress_log_id, log);
  });

  it("takes comments only, never a change request", async () => {
    await expectError(
      () => as(db, prof, (tx) => tx.query("insert into remarks (project_id, progress_log_id, author_id, kind, body) values ($1, $2, $3, 'change_request', 'redo')", [project, log, prof])),
      /Log entries take comments/,
    );
  });

  it("keeps a comment on its own project's log", async () => {
    const other = (
      await as(db, outsider, (tx) => one(tx, "select create_project('Elsewhere') as project_id"))
    ).project_id;
    await expectError(
      () => as(db, outsider, (tx) => tx.query("insert into remarks (project_id, progress_log_id, author_id, kind, body) values ($1, $2, $3, 'comment', 'hi')", [other, log, outsider])),
      /different project/,
    );
  });
});

describe("push subscriptions", () => {
  it("are private to their owner", async () => {
    await as(db, riya, (tx) => tx.query("insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/riya', 'k', 'a')"));
    const mine = await as(db, riya, (tx) => rows(tx, "select endpoint from push_subscriptions"));
    assert.deepEqual(mine.map((r) => r.endpoint), ["https://push.example/riya"]);
    const theirs = await as(db, prof, (tx) => rows(tx, "select endpoint from push_subscriptions"));
    assert.equal(theirs.length, 0);
  });

  it("can't be registered for someone else", async () => {
    await expectError(
      () => as(db, prof, (tx) => tx.query("insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/x', 'k', 'a')", [riya])),
      /row-level security/,
    );
  });
});

describe("onboarding progress", () => {
  it("starts empty for a new account and is editable by its owner only", async () => {
    const fresh = await signUp(db, { name: "Nia New", role: "student" });
    const { onboarding } = await one(db, "select onboarding from profiles where id = $1", [fresh]);
    assert.deepEqual(onboarding, {});
    await as(db, fresh, (tx) => tx.query(`update profiles set onboarding = '{"setup":"done"}' where id = $1`, [fresh]));
    const after = await one(db, "select onboarding from profiles where id = $1", [fresh]);
    assert.equal(after.onboarding.setup, "done");
    await as(db, fresh, (tx) => tx.query(`update profiles set onboarding = '{"setup":"skipped"}' where id = $1`, [riya]));
    const untouched = await one(db, "select onboarding from profiles where id = $1", [riya]);
    assert.notEqual(untouched.onboarding.setup, "skipped");
  });

  it("refuses an oversized record", async () => {
    const big = JSON.stringify({ seen: Array.from({ length: 2000 }, (_, i) => `chapter-${i}`) });
    await expectError(() => as(db, riya, (tx) => tx.query("update profiles set onboarding = $1::jsonb where id = $2", [big, riya])), /profiles_onboarding_small/);
  });
});

describe("deleting a project", () => {
  let doomed;
  before(async () => {
    doomed = (await as(db, riya, (tx) => one(tx, "select create_project('Throwaway study', '', current_date, null, $1) as id", [[prof]]))).id;
    await as(db, riya, (tx) => tx.query("insert into tasks (project_id, title, created_by) values ($1, 'Read papers', $2)", [doomed, riya]));
    await as(db, riya, (tx) => tx.query("insert into progress_logs (project_id, author_id, log_date, completed_work, minutes_spent) values ($1, $2, current_date, 'Read two papers', 60)", [doomed, riya]));
  });

  it("is refused for anyone but the creator", async () => {
    await expectError(() => as(db, prof, (tx) => tx.query("select delete_project($1, 'Throwaway study')", [doomed])), /Only the person who created this project/);
    await as(db, prof, (tx) => tx.query("delete from projects where id = $1", [doomed]));
    assert.equal((await rows(db, "select id from projects where id = $1", [doomed])).length, 1);
  });

  it("needs the project's name typed back", async () => {
    await expectError(() => as(db, riya, (tx) => tx.query("select delete_project($1, 'Throwaway')", [doomed])), /Type the project's name/);
  });

  it("removes the project and everything in it", async () => {
    await as(db, riya, (tx) => tx.query("select delete_project($1, '  throwaway STUDY ')", [doomed]));
    for (const table of ["projects", "tasks", "progress_logs", "project_members"]) {
      const col = table === "projects" ? "id" : "project_id";
      assert.equal((await rows(db, `select 1 from ${table} where ${col} = $1`, [doomed])).length, 0, table);
    }
  });
});

describe("AI question allowance", () => {
  it("records only the asker's own questions, and shows only their own", async () => {
    await as(db, riya, (tx) => tx.query("insert into ai_questions default values"));
    await as(db, riya, (tx) => tx.query("insert into ai_questions default values"));
    const mine = await as(db, riya, (tx) => one(tx, "select count(*)::int as n from ai_questions where asked_at > now() - interval '24 hours'"));
    assert.equal(mine.n, 2);
    const theirs = await as(db, prof, (tx) => one(tx, "select count(*)::int as n from ai_questions"));
    assert.equal(theirs.n, 0);
    await expectError(() => as(db, prof, (tx) => tx.query("insert into ai_questions (user_id) values ($1)", [riya])), /row-level security/);
  });
});

describe("meetings", () => {
  let meeting;
  const soon = () => new Date(Date.now() + 86_400_000).toISOString();

  it("can be booked by either side of a supervision, and only by them", async () => {
    meeting = (await as(db, prof, (tx) => one(tx, "insert into meetings (professor_id, student_id, starts_at) values ($1, $2, $3) returning id", [prof, riya, soon()]))).id;
    const byStudent = await as(db, arjun, (tx) => one(tx, "insert into meetings (professor_id, student_id, starts_at) values ($1, $2, $3) returning id", [prof, arjun, soon()]));
    assert.ok(byStudent.id);
    // "Eve Outsider" joined this professor earlier in the suite; a stranger hasn't.
    const stranger = await signUp(db, { name: "Sam Stranger", role: "student" });
    await expectError(() => as(db, stranger, (tx) => tx.query("insert into meetings (professor_id, student_id, starts_at) values ($1, $2, $3)", [prof, stranger, soon()])), /row-level security/);
    // Booking for two other people.
    await expectError(() => as(db, riya, (tx) => tx.query("insert into meetings (professor_id, student_id, starts_at) values ($1, $2, $3)", [prof, arjun, soon()])), /row-level security/);
  });

  it("is visible to its two people only", async () => {
    for (const who of [prof, riya]) assert.equal((await as(db, who, (tx) => rows(tx, "select id from meetings where id = $1", [meeting]))).length, 1);
    for (const who of [arjun, outsider]) assert.equal((await as(db, who, (tx) => rows(tx, "select id from meetings where id = $1", [meeting]))).length, 0);
  });

  it("shares its notes between them, and keeps its people fixed", async () => {
    await as(db, riya, (tx) => tx.query("update meetings set notes = 'Aim for ECCE' where id = $1", [meeting]));
    await as(db, arjun, (tx) => tx.query("update meetings set notes = 'Hijacked' where id = $1", [meeting]));
    assert.equal((await one(db, "select notes from meetings where id = $1", [meeting])).notes, "Aim for ECCE");
    await expectError(() => as(db, prof, (tx) => tx.query("update meetings set student_id = $1 where id = $2", [arjun, meeting])), /people can't be changed/);
  });

  it("takes topics from its people, ticked by either, reworded and removed by the author only", async () => {
    const topic = (await as(db, riya, (tx) => one(tx, "insert into meeting_topics (meeting_id, body) values ($1, 'ECCE or APEC?') returning id", [meeting]))).id;
    await expectError(() => as(db, arjun, (tx) => tx.query("insert into meeting_topics (meeting_id, body) values ($1, 'Sneaky')", [meeting])), /row-level security/);
    await as(db, prof, (tx) => tx.query("update meeting_topics set done = true where id = $1", [topic]));
    assert.equal((await one(db, "select done from meeting_topics where id = $1", [topic])).done, true);
    await expectError(() => as(db, prof, (tx) => tx.query("update meeting_topics set body = 'Changed' where id = $1", [topic])), /Only the person who added a topic/);
    await as(db, prof, (tx) => tx.query("delete from meeting_topics where id = $1", [topic]));
    assert.equal((await rows(db, "select 1 from meeting_topics where id = $1", [topic])).length, 1);
    await as(db, riya, (tx) => tx.query("delete from meeting_topics where id = $1", [topic]));
    assert.equal((await rows(db, "select 1 from meeting_topics where id = $1", [topic])).length, 0);
  });

  it("stamps the end time, keeps action items as tasks, and is cancelled only by its booker before it happens", async () => {
    const task = (await as(db, prof, (tx) =>
      one(tx, "insert into tasks (project_id, title, assignee_id, created_by, meeting_id) values ($1, 'Measure light-load points', $2, $3, $4) returning id", [project, riya, prof, meeting]),
    )).id;
    await as(db, riya, (tx) => tx.query("update meetings set status = 'done' where id = $1", [meeting]));
    assert.ok((await one(db, "select ended_at from meetings where id = $1", [meeting])).ended_at);
    await as(db, prof, (tx) => tx.query("delete from meetings where id = $1", [meeting]));
    assert.equal((await rows(db, "select 1 from meetings where id = $1", [meeting])).length, 1, "a finished meeting stays");
    await as(db, prof, (tx) => tx.query("update meetings set status = 'scheduled' where id = $1", [meeting]));
    await as(db, riya, (tx) => tx.query("delete from meetings where id = $1", [meeting]));
    assert.equal((await rows(db, "select 1 from meetings where id = $1", [meeting])).length, 1, "only the booker cancels");
    await as(db, prof, (tx) => tx.query("delete from meetings where id = $1", [meeting]));
    assert.equal((await rows(db, "select 1 from meetings where id = $1", [meeting])).length, 0);
    assert.equal((await one(db, "select meeting_id from tasks where id = $1", [task])).meeting_id, null);
  });
});

describe("sanity", () => {
  it("leaves today's helper consistent with the database clock", async () => {
    const { d } = await one(db, "select current_date::text as d");
    assert.equal(d, today());
  });
});
