-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('CAPTURING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "SegmentStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "MeetingItemKind" AS ENUM ('DECISION', 'REQUEST', 'BLOCKER');

-- CreateEnum
CREATE TYPE "MeetingItemStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterEnum
ALTER TYPE "AgentKind" ADD VALUE 'MEETING';

-- AlterEnum
ALTER TYPE "DraftKind" ADD VALUE 'MEETING_ACTIONS';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "meetingId" TEXT,
ADD COLUMN     "ownerName" TEXT,
ALTER COLUMN "initiativeId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "series" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "attendees" TEXT[],
    "source" TEXT NOT NULL DEFAULT 'record',
    "status" "MeetingStatus" NOT NULL DEFAULT 'CAPTURING',
    "transcript" TEXT,
    "notes" JSONB,
    "durationSec" INTEGER,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSegment" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationSec" DOUBLE PRECISION,
    "text" TEXT,
    "status" "SegmentStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "kind" "MeetingItemKind" NOT NULL,
    "text" TEXT NOT NULL,
    "owner" TEXT,
    "initiativeId" TEXT,
    "status" "MeetingItemStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meeting_workspaceId_date_idx" ON "Meeting"("workspaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSegment_meetingId_index_key" ON "MeetingSegment"("meetingId", "index");

-- CreateIndex
CREATE INDEX "MeetingItem_workspaceId_kind_status_idx" ON "MeetingItem"("workspaceId", "kind", "status");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSegment" ADD CONSTRAINT "MeetingSegment_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingItem" ADD CONSTRAINT "MeetingItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingItem" ADD CONSTRAINT "MeetingItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingItem" ADD CONSTRAINT "MeetingItem_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE SET NULL ON UPDATE CASCADE;
