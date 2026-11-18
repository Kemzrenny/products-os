import type { Role } from "@/lib/generated/prisma/enums";

// Shared by server and client code, so it imports only the enum types.

const RANK: Record<Role, number> = { VIEWER: 1, CONTRIBUTOR: 2, EDITOR: 3, ADMIN: 4 };

export const atLeast = (role: Role, min: Role) => RANK[role] >= RANK[min];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  EDITOR: "Editor",
  CONTRIBUTOR: "Contributor",
  VIEWER: "Viewer",
};

export const ROLE_HELP: Record<Role, string> = {
  ADMIN: "Sets strategy, approves decisions and agent drafts, manages the team",
  EDITOR: "Evaluates ideas, plans the roadmap, approves PRDs",
  CONTRIBUTOR: "Submits ideas, adds effort, updates milestones and tasks",
  VIEWER: "Reads everything and submits ideas",
};
