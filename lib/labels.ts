import type { DecisionOutcome, Horizon, IdeaStatus, ObjectiveStatus, Recommendation, WorkStatus, Effort, DraftKind, AgentKind } from "@/lib/generated/prisma/enums";

export type Tone = "grey" | "blue" | "green" | "amber" | "red";

export const IDEA_STATUS: Record<IdeaStatus, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "grey" },
  EVALUATED: { label: "Evaluated", tone: "blue" },
  APPROVED: { label: "Approved", tone: "green" },
  EXPLORING: { label: "Exploring", tone: "amber" },
  DEFERRED: { label: "Deferred", tone: "grey" },
  REJECTED: { label: "Rejected", tone: "red" },
};

export const RECOMMENDATION: Record<Recommendation, { label: string; tone: Tone }> = {
  BUILD_NOW: { label: "Build now", tone: "green" },
  EXPLORE: { label: "Explore further", tone: "amber" },
  DEFER: { label: "Defer", tone: "grey" },
  REJECT: { label: "Reject", tone: "red" },
};

export const OUTCOME: Record<DecisionOutcome, { label: string; tone: Tone }> = {
  APPROVED: { label: "Approved", tone: "green" },
  EXPLORING: { label: "Exploring", tone: "amber" },
  DEFERRED: { label: "Deferred", tone: "grey" },
  REJECTED: { label: "Rejected", tone: "red" },
};

export const WORK_STATUS: Record<WorkStatus, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: "Not started", tone: "grey" },
  IN_PROGRESS: { label: "In progress", tone: "blue" },
  AT_RISK: { label: "At risk", tone: "amber" },
  BLOCKED: { label: "Blocked", tone: "red" },
  DONE: { label: "Done", tone: "green" },
};

export const OBJECTIVE_STATUS: Record<ObjectiveStatus, { label: string; tone: Tone }> = {
  ON_TRACK: { label: "On track", tone: "green" },
  AT_RISK: { label: "At risk", tone: "amber" },
  OFF_TRACK: { label: "Off track", tone: "red" },
  DONE: { label: "Done", tone: "blue" },
};

export const HORIZON: Record<Horizon, string> = { NOW: "Now", NEXT: "Next", LATER: "Later" };

export const EFFORT: Record<Effort, string> = { XS: "XS · days", S: "S · 1–2 weeks", M: "M · 2–4 weeks", L: "L · 1–2 months", XL: "XL · a quarter+" };

export const DRAFT_KIND: Record<DraftKind, string> = {
  STRATEGY_PROPOSAL: "Strategy proposal",
  BACKLOG_RANKING: "Backlog ranking",
  PRD: "PRD",
  BRIEFING: "Leadership briefing",
  MEETING_ACTIONS: "Meeting updates",
};

export const AGENT: Record<AgentKind, { name: string; blurb: string }> = {
  COPILOT: { name: "Product Copilot", blurb: "Ask anything about your strategy, ideas, roadmap and decisions." },
  STRATEGY: { name: "Strategy Agent", blurb: "Finds gaps between objectives and work, and proposes initiatives." },
  PRIORITISATION: { name: "Prioritisation Agent", blurb: "Evaluates ideas and re-ranks the backlog against your strategy." },
  PRD: { name: "PRD Agent", blurb: "Drafts a PRD, user stories and acceptance criteria for an initiative." },
  BRIEFING: { name: "Briefing", blurb: "Writes the weekly leadership briefing from what changed." },
  MEETING: { name: "Meeting notes", blurb: "Transcribes standups, writes the notes and proposes task and status updates." },
};
