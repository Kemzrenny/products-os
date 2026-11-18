import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

type Tx = Prisma.TransactionClient | typeof prisma;

// Records a reading for a key result or KPI and keeps its "current" value equal to the
// latest reading by date (a reading back-dated to last month doesn't overwrite today's).
export async function recordReading(
  tx: Tx,
  target: { keyResultId: string } | { kpiId: string },
  reading: { value: number; date: Date; note?: string | null; source?: "manual" | "import"; userId?: string | null },
) {
  await tx.checkin.create({
    data: { ...target, value: reading.value, date: reading.date, note: reading.note ?? null, source: reading.source ?? "manual", createdById: reading.userId ?? null },
  });
  const latest = await tx.checkin.findFirst({ where: target, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  if (!latest) return;
  if ("keyResultId" in target) await tx.keyResult.update({ where: { id: target.keyResultId }, data: { current: latest.value } });
  else await tx.kpi.update({ where: { id: target.kpiId }, data: { current: latest.value } });
}
