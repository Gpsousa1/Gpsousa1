-- CreateEnum
CREATE TYPE "AttestationStatus" AS ENUM ('ATIVA', 'EXPIRADA', 'REVOGADA');

-- CreateEnum
CREATE TYPE "ScoreModelType" AS ENUM ('HEURISTIC', 'SCORECARD', 'GBM');

-- CreateTable
CREATE TABLE "score_model_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "tipo" "ScoreModelType" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_attestations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "pd" DOUBLE PRECISION NOT NULL,
    "rating" TEXT NOT NULL,
    "cashflow" JSONB NOT NULL,
    "bureauStatus" TEXT NOT NULL,
    "identityStatus" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "status" "AttestationStatus" NOT NULL DEFAULT 'ATIVA',
    "emitidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_attestations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bureau_queries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultado" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bureau_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_outcomes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "evento" TEXT NOT NULL,
    "valor" DOUBLE PRECISION,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "score_model_versions_version_key" ON "score_model_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "credit_attestations_hash_key" ON "credit_attestations"("hash");

-- CreateIndex
CREATE INDEX "credit_attestations_userId_idx" ON "credit_attestations"("userId");

-- CreateIndex
CREATE INDEX "bureau_queries_userId_idx" ON "bureau_queries"("userId");

-- CreateIndex
CREATE INDEX "credit_outcomes_userId_idx" ON "credit_outcomes"("userId");
