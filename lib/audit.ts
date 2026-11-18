import "server-only";
import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/context";

// Every approval, rejection and change people make is written here, so a team can see
// who decided what, and when.
export async function audit(ctx: Ctx, action: string, targetType: string, targetId: string | null, summary: string) {
  await prisma.auditLog
    .create({ data: { workspaceId: ctx.workspace.id, userId: ctx.user.id, action, targetType, targetId, summary } })
    .catch((err) => console.error("audit", err));
}
