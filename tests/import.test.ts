import { test } from "node:test";
import assert from "node:assert/strict";
import { detectOkr, detectIdeas, detectTracker, guessKind } from "../lib/import/detect";
import { okrSections, parseOkrRows, initiativeTitle } from "../lib/import/okr";
import { parseIdeaRows } from "../lib/import/requests";
import { parseTracker, weekEnd } from "../lib/import/tracker";
import { num, status, names, date } from "../lib/import/values";
import { csvToGrid } from "../lib/import/workbook";
import type { Grid } from "../lib/import/types";

// Shapes taken from real team spreadsheets, with made-up content.

const okrSheet: Grid = [
  [null, "Objective \nWE WILL...", "Key Results \nAS MEASURED BY...", "Initiatives", "Deliverables", "Status", "Starting Metric", "Target Metric", "Grade ", "% Grade", "Lead", "Due date ", "Comments"],
  ["Q3", null, null, null, null, null, null, null, null, 0.5],
  [null, "Old objective", "Old KR", null, null, "Done", 0, 1, 1, 1],
  ["Q4", null, null, null, null, null, null, null, null, 0.7],
  [null, "Help students study regularly", "Increase seven-day study activation from ~17% to 25%", "1. Improve onboarding into course content: help students pick courses.\n\n2. Nudges", "25% activation", "Ongoing", 0.17, 0.25, 0.21, 0.5, "Ada\nBola", "2026-12-31", "New homepage shipped"],
  [null, null, "Increase MASS from 6,776 to 12,000", "1. Surface study tools", "12,000 MASS", "Ongoing", 6776, 12000, 7003, 0.04, "Ada", "2026-12-31", null],
  [null, null, null, null, null, null, null, null, null, null],
  [null, "Unblock institutions", "Deploy the web app with 100% of agreed requirements", "Agree scope", null, "Blocked", 0.2, 1, 0.6, 0.5, "Tolu/Jake", "31/12/2026", "Waiting on SSO"],
  [null, "Priorities for the remaining six weeks", "For the second half of Q4, I would recommend concentrating the team on four areas: retention, premium, portals and scholars.", null],
];

test("finds the header, the columns and the quarter sections", () => {
  const d = detectOkr(okrSheet);
  assert.equal(d.headerRow, 0);
  assert.equal(d.mapping.objective, 1);
  assert.equal(d.mapping.keyResult, 2);
  assert.equal(d.mapping.baseline, 6);
  assert.equal(d.mapping.target, 7);
  assert.equal(d.mapping.current, 8);
  assert.equal(d.mapping.progress, 9);
  const s = okrSections(okrSheet, d.headerRow, d.mapping);
  assert.deepEqual(s.map((x) => x.label), ["Q3", "Q4"]);
  assert.equal(guessKind("Product OKRs", okrSheet).kind, "OKRS");
});

test("reads one quarter, carrying merged objectives down and scaling percentages", () => {
  const d = detectOkr(okrSheet);
  const q4 = okrSections(okrSheet, d.headerRow, d.mapping)[1];
  const plan = parseOkrRows(okrSheet, d.headerRow, d.mapping, { from: q4.row, period: "Q4 2026" });
  assert.equal(plan.objectives.length, 3);
  const [study, inst, notes] = plan.objectives;
  assert.equal(study.keyResults.length, 2);
  assert.deepEqual([study.keyResults[0].baseline, study.keyResults[0].current, study.keyResults[0].target, study.keyResults[0].unit], [17, 21, 25, "%"]);
  assert.deepEqual([study.keyResults[1].baseline, study.keyResults[1].current, study.keyResults[1].target, study.keyResults[1].unit], [6776, 7003, 12000, null]);
  assert.deepEqual(study.keyResults[0].leads, ["Ada", "Bola"]);
  assert.equal(study.keyResults[0].status, "IN_PROGRESS");
  assert.equal(inst.keyResults[0].status, "BLOCKED");
  assert.equal(inst.keyResults[0].due, "2026-12-31");
  assert.equal(inst.keyResults[0].current, 60);
  assert.ok(notes.keyResults[0].skip, "a long note with no numbers is suggested to skip");
  assert.equal(initiativeTitle(study.keyResults[0]), "Improve onboarding into course content");
});

test("reads a request log, mapping statuses to decisions", () => {
  const sheet: Grid = [
    [null],
    ["Request ID", "Date Submitted", "Request Type", "Request / Complaint Description", "Product Category", "Requested By", "Priority", "Status", "Assigned To", "Target Date", "Resolution / Improvement Action"],
    ["PR-0001", "2026-07-21", "New Feature", "Feature Request Summary\n\nCreate three forms:\n\n1. Lecturer form", "Rep Console, Ambassador Console", "Praise", "Medium", "New", "PDE"],
    ["PR-0002", "2026-07-21", "Bug/Complaint", "Payout Details is not working. Review the flow.", "Super Admin", "Praise", "High", "Resolved", "PDE", null, "Fixed in v2.3"],
    [null, null, null, null, null, null, "Critical"],
  ];
  const d = detectIdeas(sheet);
  assert.equal(d.headerRow, 1);
  const plan = parseIdeaRows(sheet, d.headerRow, d.mapping);
  assert.equal(plan.ideas.length, 2);
  assert.equal(plan.ideas[0].title, "Create three forms: Lecturer form");
  assert.equal(plan.ideas[0].status, "NEW");
  assert.equal(plan.ideas[1].title, "Payout Details is not working");
  assert.equal(plan.ideas[1].status, "APPROVED");
  assert.equal(plan.ideas[1].resolved, true);
  assert.equal(guessKind("Reps Portal", sheet).kind, "IDEAS");
});

test("reads weekly actuals from a tracker as dated readings", () => {
  const sheet: Grid = [
    ["Q2 OKR Tracker | Apr 6 – Jun 30, 2026"],
    ["Metric / KR", "Unit", "Q2 Target", "W1 — Apr 6–12", null, null, "W2 — Apr 13–19", null, null, "April total"],
    [null, null, null, "Target", "Actual", "%", "Target", "Actual", "%", "Target"],
    ["Objective 1 — Study"],
    ["★  Study sessions adoption (% of active users)", "%", 0.25, 0.25, 0.184, 0.7, 0.25, 0.215, 0.86, 0.25],
    ["Signups", "#", 25000, 1000, 900, 0.9, 1200, null, null],
  ];
  const t = detectTracker(sheet);
  assert.equal(t.labelRow, 1);
  const plan = parseTracker(sheet, t.labelRow, 2026);
  assert.equal(plan.series.length, 2);
  assert.equal(plan.series[0].group, "Objective 1 — Study");
  assert.equal(plan.series[0].name, "Study sessions adoption (% of active users)");
  assert.equal(plan.series[0].target, 25);
  assert.deepEqual(plan.series[0].points.map((p) => [p.date, p.value]), [["2026-04-12", 18.4], ["2026-04-19", 21.5]]);
  assert.deepEqual(plan.series[1].points.map((p) => p.value), [900]);
});

test("week labels give the week's last day", () => {
  assert.equal(weekEnd("W1 — Apr 6–12", 2026), "2026-04-12");
  assert.equal(weekEnd("Week 4  (Oct 28–Nov 3)", 2026), "2026-11-03");
  assert.equal(weekEnd("W4 | Apr 28–May 4 | Target", 2026), "2026-05-04");
});

test("values as people type them", () => {
  assert.deepEqual(num("6,776"), { value: 6776, percent: false });
  assert.deepEqual(num("25%"), { value: 25, percent: true });
  assert.equal(num("#N/A"), null);
  assert.equal(num("—"), null);
  assert.equal(status("Dev Ongoing"), "IN_PROGRESS");
  assert.equal(status("Pending"), "NOT_STARTED");
  assert.equal(status("Done"), "DONE");
  assert.deepEqual(names("Morenike\nOluchi"), ["Morenike", "Oluchi"]);
  assert.deepEqual(names("Tolu/Jake"), ["Tolu", "Jake"]);
  assert.equal(date("31/12/2026"), "2026-12-31");
  assert.equal(date("Dec 31, 2026"), "2026-12-31");
});

test("CSV with quotes and semicolons", () => {
  const g = csvToGrid('Objective;Key result;Target\n"Grow; fast";"Hit ""25%""";25\n');
  assert.deepEqual(g, [["Objective", "Key result", "Target"], ["Grow; fast", 'Hit "25%"', "25"]]);
});
