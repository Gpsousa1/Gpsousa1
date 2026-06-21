-- CreateEnum
CREATE TYPE "ScoreTier" AS ENUM ('BRONZE', 'PRATA', 'OURO', 'DIAMANTE');

-- CreateEnum
CREATE TYPE "CertType" AS ENUM ('CCFV', 'A1', 'OUTRO');

-- CreateEnum
CREATE TYPE "CertStatus" AS ENUM ('ATIVO', 'REVOGADO', 'EXPIRADO');

-- CreateTable
CREATE TABLE "mei_gamification" (
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "creditBonus" INTEGER NOT NULL DEFAULT 0,
    "plano" TEXT NOT NULL DEFAULT 'Gratuito',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mei_gamification_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "missions" (
    "code" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "icon" TEXT NOT NULL,
    "cat" TEXT NOT NULL,
    "recompensaCredito" INTEGER NOT NULL,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "mission_progress" (
    "userId" TEXT NOT NULL,
    "missionCode" INTEGER NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "mission_progress_pkey" PRIMARY KEY ("userId","missionCode")
);

-- CreateTable
CREATE TABLE "score_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "tier" "ScoreTier" NOT NULL,
    "raw" DOUBLE PRECISION NOT NULL,
    "version" TEXT NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT 'RECALCULO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_factors" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "fator" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "contribuicao" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "score_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "CertType" NOT NULL,
    "status" "CertStatus" NOT NULL DEFAULT 'ATIVO',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validity" TEXT,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hash" TEXT NOT NULL,
    "emitidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3),

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_videos" (
    "code" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "dur" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "cat" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,

    CONSTRAINT "education_videos_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "education_progress" (
    "userId" TEXT NOT NULL,
    "videoCode" TEXT NOT NULL,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "education_progress_pkey" PRIMARY KEY ("userId","videoCode")
);

-- CreateIndex
CREATE INDEX "mission_progress_userId_idx" ON "mission_progress"("userId");

-- CreateIndex
CREATE INDEX "score_snapshots_userId_createdAt_idx" ON "score_snapshots"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "score_factors_snapshotId_idx" ON "score_factors"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_hash_key" ON "certificates"("hash");

-- CreateIndex
CREATE INDEX "certificates_userId_idx" ON "certificates"("userId");

-- CreateIndex
CREATE INDEX "certificates_tipo_idx" ON "certificates"("tipo");

-- CreateIndex
CREATE INDEX "education_progress_userId_idx" ON "education_progress"("userId");

-- AddForeignKey
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_missionCode_fkey" FOREIGN KEY ("missionCode") REFERENCES "missions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_factors" ADD CONSTRAINT "score_factors_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "score_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_progress" ADD CONSTRAINT "education_progress_videoCode_fkey" FOREIGN KEY ("videoCode") REFERENCES "education_videos"("code") ON DELETE CASCADE ON UPDATE CASCADE;
