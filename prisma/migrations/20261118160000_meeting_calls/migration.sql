-- DropIndex
DROP INDEX "MeetingSegment_meetingId_index_key";

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "callEndedAt" TIMESTAMP(3),
ADD COLUMN     "callStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MeetingSegment" ADD COLUMN     "speaker" TEXT,
ADD COLUMN     "track" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSegment_meetingId_track_index_key" ON "MeetingSegment"("meetingId", "track", "index");
