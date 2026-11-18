-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('OKRS', 'IDEAS', 'METRICS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'APPLIED', 'DISCARDED');

-- AlterTable
ALTER TABLE "Objective" ADD COLUMN     "period" TEXT;

-- AlterTable
ALTER TABLE "KeyResult" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "leadNames" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "objectiveId" TEXT,
ADD COLUMN     "status" "WorkStatus",
ALTER COLUMN "okrId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Idea" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "priority" TEXT,
ADD COLUMN     "requestType" TEXT;

-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "recordedAtImport" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN     "leadNames" TEXT;

-- CreateTable
CREATE TABLE "Checkin" (
    "id" TEXT NOT NULL,
    "keyResultId" TEXT,
    "kpiId" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "fileName" TEXT,
    "sheetName" TEXT,
    "period" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "plan" JSONB NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Checkin_keyResultId_date_idx" ON "Checkin"("keyResultId", "date");

-- CreateIndex
CREATE INDEX "Checkin_kpiId_date_idx" ON "Checkin"("kpiId", "date");

-- AddForeignKey
ALTER TABLE "KeyResult" ADD CONSTRAINT "KeyResult_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "KeyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
