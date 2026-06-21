-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('SOLICITADA', 'EM_ANALISE', 'APROVADA', 'REPROVADA', 'LIBERADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "CreditDecisionType" AS ENUM ('PRE_ANALISE', 'APROVACAO', 'REPROVACAO');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDENTE', 'PAGA');

-- CreateEnum
CREATE TYPE "FraudNivel" AS ENUM ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('DEBITO', 'CREDITO');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PixChargeStatus" AS ENUM ('ATIVA', 'CONCLUIDA', 'EXPIRADA', 'REMOVIDA');

-- CreateEnum
CREATE TYPE "PixTransferStatus" AS ENUM ('PENDENTE', 'LIQUIDADA', 'FALHOU');

-- CreateEnum
CREATE TYPE "AdvisorKind" AS ENUM ('ANALYSIS', 'RECOMMENDATION', 'EDUCATION', 'CREDIT_GUIDANCE', 'SCORE_INTERPRETATION');

-- CreateTable
CREATE TABLE "credit_applications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "parcelas" INTEGER NOT NULL,
    "finalidade" TEXT NOT NULL DEFAULT 'Capital de giro',
    "scoreNaMidia" INTEGER,
    "taxaEstimada" DOUBLE PRECISION,
    "valorParcelaEstimada" DOUBLE PRECISION,
    "iofEstimado" DOUBLE PRECISION,
    "fraudScore" INTEGER,
    "fraudFlags" JSONB,
    "status" "CreditStatus" NOT NULL DEFAULT 'SOLICITADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_decisions" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "tipo" "CreditDecisionType" NOT NULL,
    "aprovado" BOOLEAN NOT NULL,
    "taxaJuros" DOUBLE PRECISION,
    "motivo" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_contracts" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "valorPrincipal" DOUBLE PRECISION NOT NULL,
    "taxaJuros" DOUBLE PRECISION NOT NULL,
    "parcelas" INTEGER NOT NULL,
    "valorParcela" DOUBLE PRECISION NOT NULL,
    "valorTotal" DOUBLE PRECISION NOT NULL,
    "iof" DOUBLE PRECISION NOT NULL,
    "cet" DOUBLE PRECISION NOT NULL,
    "comissao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "liberadaEm" TIMESTAMP(3),
    "ledgerTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "juros" DOUBLE PRECISION NOT NULL,
    "amortizacao" DOUBLE PRECISION NOT NULL,
    "saldo" DOUBLE PRECISION NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDENTE',
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_rules" (
    "code" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "pontos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_rules_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "fraud_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "applicationId" TEXT,
    "riskScore" INTEGER NOT NULL,
    "nivel" "FraudNivel" NOT NULL,
    "flags" JSONB NOT NULL,
    "bloqueado" BOOLEAN NOT NULL,
    "alerta" BOOLEAN NOT NULL,
    "deviceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_scores" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "nivel" "FraudNivel" NOT NULL,
    "flags" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_blacklist" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" TEXT NOT NULL,
    "reference" TEXT,
    "descricao" TEXT NOT NULL,
    "balanced" BOOLEAN NOT NULL DEFAULT true,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "tipo" "LedgerEntryType" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "of_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "externalConsentId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "of_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "of_account_syncs" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "of_account_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pix_charges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" "PixChargeStatus" NOT NULL DEFAULT 'ATIVA',
    "brcode" TEXT,
    "e2eId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pix_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pix_transfers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "pixKey" TEXT NOT NULL,
    "status" "PixTransferStatus" NOT NULL DEFAULT 'PENDENTE',
    "e2eId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pix_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pix_webhooks" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pix_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisor_interactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AdvisorKind" NOT NULL,
    "input" JSONB,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advisor_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_applications_userId_idx" ON "credit_applications"("userId");

-- CreateIndex
CREATE INDEX "credit_applications_status_idx" ON "credit_applications"("status");

-- CreateIndex
CREATE INDEX "credit_decisions_applicationId_idx" ON "credit_decisions"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_contracts_applicationId_key" ON "credit_contracts"("applicationId");

-- CreateIndex
CREATE INDEX "installments_contractId_idx" ON "installments"("contractId");

-- CreateIndex
CREATE INDEX "fraud_events_userId_idx" ON "fraud_events"("userId");

-- CreateIndex
CREATE INDEX "fraud_events_createdAt_idx" ON "fraud_events"("createdAt");

-- CreateIndex
CREATE INDEX "fraud_scores_userId_createdAt_idx" ON "fraud_scores"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "fraud_blacklist_tipo_valor_key" ON "fraud_blacklist"("tipo", "valor");

-- CreateIndex
CREATE INDEX "ledger_transactions_reference_idx" ON "ledger_transactions"("reference");

-- CreateIndex
CREATE INDEX "ledger_entries_transactionId_idx" ON "ledger_entries"("transactionId");

-- CreateIndex
CREATE INDEX "ledger_entries_accountCode_idx" ON "ledger_entries"("accountCode");

-- CreateIndex
CREATE INDEX "of_consents_userId_idx" ON "of_consents"("userId");

-- CreateIndex
CREATE INDEX "of_account_syncs_consentId_idx" ON "of_account_syncs"("consentId");

-- CreateIndex
CREATE UNIQUE INDEX "pix_charges_txid_key" ON "pix_charges"("txid");

-- CreateIndex
CREATE INDEX "pix_charges_userId_idx" ON "pix_charges"("userId");

-- CreateIndex
CREATE INDEX "pix_transfers_userId_idx" ON "pix_transfers"("userId");

-- CreateIndex
CREATE INDEX "advisor_interactions_userId_createdAt_idx" ON "advisor_interactions"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "credit_decisions" ADD CONSTRAINT "credit_decisions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "credit_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_contracts" ADD CONSTRAINT "credit_contracts_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "credit_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "credit_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountCode_fkey" FOREIGN KEY ("accountCode") REFERENCES "ledger_accounts"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "of_account_syncs" ADD CONSTRAINT "of_account_syncs_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "of_consents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
