
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR', 'CONTRIBUTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ObjectiveStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'DONE');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('NEW', 'EVALUATED', 'APPROVED', 'EXPLORING', 'DEFERRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Effort" AS ENUM ('XS', 'S', 'M', 'L', 'XL');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('QUOTE', 'METRIC', 'LINK', 'NOTE');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('BUILD_NOW', 'EXPLORE', 'DEFER', 'REJECT');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('APPROVED', 'EXPLORING', 'DEFERRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Horizon" AS ENUM ('NOW', 'NEXT', 'LATER');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "AgentKind" AS ENUM ('COPILOT', 'STRATEGY', 'PRIORITISATION', 'PRD', 'BRIEFING');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('STRATEGY_PROPOSAL', 'BACKLOG_RANKING', 'PRD', 'BRIEFING');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "vision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "token" TEXT NOT NULL,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategyVersion" INTEGER NOT NULL DEFAULT 1,
    "capacityNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "vision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "baseline" DOUBLE PRECISION,
    "current" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pillar" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Pillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Objective" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pillarId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metric" TEXT,
    "target" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "ObjectiveStatus" NOT NULL DEFAULT 'ON_TRACK',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Objective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Okr" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "objectiveId" TEXT,
    "title" TEXT NOT NULL,
    "period" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Okr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyResult" (
    "id" TEXT NOT NULL,
    "okrId" TEXT NOT NULL,
    "kpiId" TEXT,
    "title" TEXT NOT NULL,
    "baseline" DOUBLE PRECISION,
    "current" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "unit" TEXT,

    CONSTRAINT "KeyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "requester" TEXT,
    "problemWho" TEXT,
    "problemWhat" TEXT,
    "problemWhy" TEXT,
    "effort" "Effort",
    "effortNote" TEXT,
    "effortById" TEXT,
    "status" "IdeaStatus" NOT NULL DEFAULT 'NEW',
    "rank" INTEGER,
    "submittedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaObjective" (
    "ideaId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,

    CONSTRAINT "IdeaObjective_pkey" PRIMARY KEY ("ideaId","objectiveId")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "ratings" JSONB NOT NULL,
    "impactScore" INTEGER NOT NULL,
    "alignmentScore" INTEGER NOT NULL,
    "recommendation" "Recommendation" NOT NULL,
    "rationale" TEXT NOT NULL,
    "objectiveIds" TEXT[],
    "openQuestions" TEXT[],
    "model" TEXT NOT NULL,
    "strategyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "outcome" "DecisionOutcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "deferUntil" TIMESTAMP(3),
    "aiRecommendation" "Recommendation",
    "strategyVersion" INTEGER NOT NULL,
    "decidedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Initiative" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT,
    "ideaId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "horizon" "Horizon" NOT NULL DEFAULT 'NEXT',
    "status" "WorkStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "statusNote" TEXT,
    "ownerId" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "prd" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Initiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitiativeObjective" (
    "initiativeId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,

    CONSTRAINT "InitiativeObjective_pkey" PRIMARY KEY ("initiativeId","objectiveId")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "WorkStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "title" TEXT NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agent" "AgentKind" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB,
    "error" TEXT,
    "model" TEXT,
    "strategyVersion" INTEGER NOT NULL,
    "startedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" "DraftKind" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "targetId" TEXT,
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Briefing" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Briefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Member_organisationId_userId_key" ON "Member"("organisationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_organisationId_email_key" ON "Invitation"("organisationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_workspaceId_version_key" ON "StrategyVersion"("workspaceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Initiative_ideaId_key" ON "Initiative"("ideaId");

-- CreateIndex
CREATE UNIQUE INDEX "Briefing_shareToken_key" ON "Briefing"("shareToken");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pillar" ADD CONSTRAINT "Pillar_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "Pillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Okr" ADD CONSTRAINT "Okr_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Okr" ADD CONSTRAINT "Okr_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyResult" ADD CONSTRAINT "KeyResult_okrId_fkey" FOREIGN KEY ("okrId") REFERENCES "Okr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyResult" ADD CONSTRAINT "KeyResult_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_effortById_fkey" FOREIGN KEY ("effortById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaObjective" ADD CONSTRAINT "IdeaObjective_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaObjective" ADD CONSTRAINT "IdeaObjective_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeObjective" ADD CONSTRAINT "InitiativeObjective_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeObjective" ADD CONSTRAINT "InitiativeObjective_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Briefing" ADD CONSTRAINT "Briefing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
