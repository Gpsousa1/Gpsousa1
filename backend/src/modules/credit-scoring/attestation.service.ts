import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AttestationStatus } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BUREAU_PROVIDER, BureauProvider } from './bureau.provider';
import { computeCashflowFeatures } from './cashflow.engine';
import { HeuristicScorecardModel } from './scoring-model';
import { IssueAttestationDto, RecordOutcomeDto } from './dto/attestation.dto';

const ATTESTATION_VALIDITY_DAYS = 30;

@Injectable()
export class AttestationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BUREAU_PROVIDER) private readonly bureau: BureauProvider,
  ) {}

  private async activeModel(): Promise<HeuristicScorecardModel> {
    const active = await this.prisma.scoreModelVersion.findFirst({
      where: { ativo: true },
      orderBy: { createdAt: 'desc' },
    });
    return new HeuristicScorecardModel(active?.version ?? 'heuristic-1.0');
  }

  private async behaviouralScore(userId: string, override?: number): Promise<number> {
    if (typeof override === 'number') return override;
    const snap = await this.prisma.scoreSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return snap?.total ?? 300;
  }

  /** Issues a bank-facing credit attestation (CCFV v2). */
  async issue(userId: string, dto: IssueAttestationDto) {
    const score = await this.behaviouralScore(userId, dto.score);
    const cashflow = computeCashflowFeatures(dto.transactions ?? []);

    // Bureau / SCR lookup (Noop → NOT_CONNECTED, still issues attestation).
    let bureauStatus = 'NOT_CONNECTED';
    if (dto.documento) {
      const result = await this.bureau.consultar(dto.documento);
      await this.prisma.bureauQuery.create({
        data: {
          userId,
          provider: this.bureau.name,
          documento: dto.documento,
          status: result.status,
          resultado: result.raw as object | undefined,
        },
      });
      if (result.status === 'OK') {
        bureauStatus = result.negativado ? 'NEGATIVE' : 'CLEAN';
      }
    }

    const model = await this.activeModel();
    const scoring = model.score({
      score,
      cashflow: {
        mesesPositivosPct: cashflow.mesesPositivosPct,
        volatilidade: cashflow.volatilidade,
        margemMedia: cashflow.margemMedia,
      },
    });

    const emitidoEm = new Date();
    const expiraEm = new Date(emitidoEm.getTime() + ATTESTATION_VALIDITY_DAYS * 86400000);
    const identityStatus = 'PENDING'; // KYC/KYB plugs in here in a future phase

    const canonical = JSON.stringify({
      userId,
      modelVersion: scoring.modelVersion,
      score,
      pd: scoring.pd,
      rating: scoring.rating,
      cashflow,
      bureauStatus,
      identityStatus,
      emitidoEm: emitidoEm.toISOString(),
      nonce: randomUUID(),
    });
    const hash = createHash('sha256').update(canonical).digest('hex');

    const attestation = await this.prisma.creditAttestation.create({
      data: {
        userId,
        modelVersion: scoring.modelVersion,
        score,
        pd: scoring.pd,
        rating: scoring.rating,
        cashflow: cashflow as object,
        bureauStatus,
        identityStatus,
        hash,
        expiraEm,
      },
    });

    return { ...attestation, calibrado: scoring.calibrated };
  }

  list(userId: string) {
    return this.prisma.creditAttestation.findMany({
      where: { userId },
      orderBy: { emitidoEm: 'desc' },
    });
  }

  async get(userId: string, id: string) {
    const att = await this.prisma.creditAttestation.findFirst({ where: { id, userId } });
    if (!att) throw new NotFoundException('Attestation not found');
    return att;
  }

  /** Public verification consumed by a partner bank (no PII). */
  async verify(hash: string) {
    const att = await this.prisma.creditAttestation.findUnique({ where: { hash } });
    if (!att) return { valid: false };
    const expired = att.expiraEm.getTime() < Date.now();
    return {
      valid: att.status === AttestationStatus.ATIVA && !expired,
      modelVersion: att.modelVersion,
      score: att.score,
      pd: att.pd,
      rating: att.rating,
      bureauStatus: att.bureauStatus,
      identityStatus: att.identityStatus,
      cashflow: att.cashflow,
      emitidoEm: att.emitidoEm,
      expiraEm: att.expiraEm,
      // PD is a HEURISTIC placeholder until a calibrated model is plugged in.
      calibrado: false,
    };
  }

  /** Outcome loop: records real repayment/default for future model retraining. */
  recordOutcome(dto: RecordOutcomeDto, valor?: number) {
    return this.prisma.creditOutcome.create({
      data: {
        userId: dto.userId,
        applicationId: dto.applicationId,
        evento: dto.evento,
        valor,
      },
    });
  }

  listModels() {
    return this.prisma.scoreModelVersion.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
