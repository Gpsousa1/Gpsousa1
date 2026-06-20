import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreditDecisionType, CreditStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { FraudService } from '../fraud/fraud.service';
import { LedgerService } from '../ledger/ledger.service';
import { risk } from '../score/score.engine';
import {
  ApproveCreditDto,
  RejectCreditDto,
  RequestCreditDto,
  SimulateCreditDto,
} from './dto/credit.dto';
import { calcCET, calcIOF, calcPMT, tabelaAmortizacao } from './price-table';

// Ledger accounts used by credit release (seeded in prisma/seed.ts).
const ACC_CREDITO_CONCEDIDO = '1.1.2';
const ACC_CAIXA = '1.1.1';

@Injectable()
export class CreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fraud: FraudService,
    private readonly ledger: LedgerService,
  ) {}

  private rateFor(score: number, faturamento: number): number {
    const r = risk(score, faturamento);
    if (!r.approved) return 3.5;
    return parseFloat(r.rate.replace('%', '').replace(',', '.').trim());
  }

  /** Stateless simulation (PMT/IOF/CET + amortization). */
  simulate(dto: SimulateCreditDto) {
    const score = dto.score ?? 300;
    const taxa = dto.taxaMensal ?? this.rateFor(score, dto.faturamento ?? 0);
    const pmt = calcPMT(dto.valor, taxa, dto.parcelas);
    const iof = calcIOF(dto.valor, dto.parcelas * 30);
    const cet = calcCET(dto.valor, pmt, dto.parcelas, iof, taxa);
    const r = risk(score, dto.faturamento ?? 0);
    return {
      valor: dto.valor,
      parcelas: dto.parcelas,
      taxaMensal: taxa,
      valorParcela: Math.round(pmt * 100) / 100,
      valorTotal: Math.round(pmt * dto.parcelas * 100) / 100,
      iof,
      cet,
      limite: r.limit,
      aprovavel: r.approved,
      nivelRisco: r.level,
      amortizacao: tabelaAmortizacao(dto.valor, taxa, dto.parcelas),
    };
  }

  private async currentScore(userId: string, override?: number): Promise<number> {
    if (typeof override === 'number') return override;
    const snap = await this.prisma.scoreSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return snap?.total ?? 300;
  }

  /** Credit request: fraud gate + velocity cap + persisted application. */
  async request(userId: string, dto: RequestCreditDto, meta: { ip?: string; userAgent?: string }) {
    const ativas = await this.prisma.creditApplication.count({
      where: { userId, status: { in: [CreditStatus.SOLICITADA, CreditStatus.EM_ANALISE] } },
    });

    const fraud = await this.fraud.evaluate(
      {
        operacoes: Array.from({ length: ativas }, () => ({ status: 'SOLICITADA' })),
        transactions: dto.transactions ?? [],
        faturamento: dto.faturamento ?? 0,
        deviceId: dto.deviceId,
      },
      { userId, ip: meta.ip, userAgent: meta.userAgent },
    );
    if (fraud.bloqueado) {
      throw new ForbiddenException(
        `Solicitação bloqueada pelo antifraude: ${fraud.flags.join(', ')}`,
      );
    }

    // Velocity: max 2 active requests (frontend rule).
    if (ativas >= 2) {
      throw new ConflictException('Você já possui solicitações em análise. Aguarde o resultado.');
    }

    const score = await this.currentScore(userId, dto.score);
    const taxaEstimada = this.rateFor(score, dto.faturamento ?? 0);
    const pmtEstimado = calcPMT(dto.valor, taxaEstimada, dto.parcelas);
    const iofEstimado = calcIOF(dto.valor, dto.parcelas * 30);

    const application = await this.prisma.creditApplication.create({
      data: {
        userId,
        valor: dto.valor,
        parcelas: dto.parcelas,
        finalidade: dto.finalidade ?? 'Capital de giro',
        scoreNaMidia: score,
        taxaEstimada,
        valorParcelaEstimada: Math.round(pmtEstimado * 100) / 100,
        iofEstimado,
        fraudScore: fraud.riskScore,
        fraudFlags: fraud.flags,
        status: CreditStatus.SOLICITADA,
      },
    });
    return { application, fraud };
  }

  async preAnalise(applicationId: string, actorId: string) {
    const app = await this.getApp(applicationId);
    await this.prisma.creditDecision.create({
      data: { applicationId: app.id, tipo: CreditDecisionType.PRE_ANALISE, aprovado: true, actorId },
    });
    return this.prisma.creditApplication.update({
      where: { id: app.id },
      data: { status: CreditStatus.EM_ANALISE },
    });
  }

  /** Approval: recompute PMT/IOF/CET/total, create contract + installments. */
  async approve(applicationId: string, dto: ApproveCreditDto, actorId: string) {
    const app = await this.getApp(applicationId);
    if (app.status === CreditStatus.LIBERADA || app.status === CreditStatus.REPROVADA) {
      throw new BadRequestException(`Application is already ${app.status}`);
    }
    const pmt = calcPMT(app.valor, dto.taxaJuros, app.parcelas);
    const iof = calcIOF(app.valor, app.parcelas * 30);
    const valorTotal = Math.round(pmt * app.parcelas * 100) / 100;
    const cet = calcCET(app.valor, pmt, app.parcelas, iof, dto.taxaJuros);
    const pmtFinal = Math.round(pmt * 100) / 100;
    const schedule = tabelaAmortizacao(app.valor, dto.taxaJuros, app.parcelas);
    const now = new Date();

    const contract = await this.prisma.$transaction(async (tx) => {
      await tx.creditDecision.create({
        data: {
          applicationId: app.id,
          tipo: CreditDecisionType.APROVACAO,
          aprovado: true,
          taxaJuros: dto.taxaJuros,
          actorId,
        },
      });
      await tx.creditApplication.update({
        where: { id: app.id },
        data: { status: CreditStatus.APROVADA },
      });
      return tx.creditContract.create({
        data: {
          applicationId: app.id,
          valorPrincipal: app.valor,
          taxaJuros: dto.taxaJuros,
          parcelas: app.parcelas,
          valorParcela: pmtFinal,
          valorTotal,
          iof,
          cet,
          installments: {
            create: schedule.map((row) => ({
              numero: row.parcela,
              valor: row.pmt,
              juros: row.juros,
              amortizacao: row.amortizacao,
              saldo: row.saldo,
              vencimento: new Date(now.getFullYear(), now.getMonth() + row.parcela, now.getDate()),
            })),
          },
        },
        include: { installments: true },
      });
    });
    return contract;
  }

  async reject(applicationId: string, dto: RejectCreditDto, actorId: string) {
    const app = await this.getApp(applicationId);
    await this.prisma.creditDecision.create({
      data: {
        applicationId: app.id,
        tipo: CreditDecisionType.REPROVACAO,
        aprovado: false,
        motivo: dto.motivo,
        actorId,
      },
    });
    return this.prisma.creditApplication.update({
      where: { id: app.id },
      data: { status: CreditStatus.REPROVADA },
    });
  }

  /**
   * Release: posts a balanced double-entry ledger transaction IN THE SAME
   * DB transaction as the status change. No money moves without a ledger record.
   */
  async release(applicationId: string) {
    const app = await this.getApp(applicationId);
    const contract = await this.prisma.creditContract.findUnique({
      where: { applicationId: app.id },
    });
    if (app.status !== CreditStatus.APROVADA || !contract) {
      throw new BadRequestException('Application must be APROVADA with a contract before release');
    }

    return this.prisma.$transaction(async (tx) => {
      const ledgerTx = await this.ledger.post(
        {
          reference: `credit:${app.id}`,
          descricao: `Liberação de crédito ${app.id}`,
          entries: [
            { accountCode: ACC_CREDITO_CONCEDIDO, tipo: 'DEBITO', valor: contract.valorPrincipal },
            { accountCode: ACC_CAIXA, tipo: 'CREDITO', valor: contract.valorPrincipal },
          ],
        },
        tx,
      );
      await tx.creditContract.update({
        where: { id: contract.id },
        data: { liberadaEm: new Date(), ledgerTxId: ledgerTx.id },
      });
      const updated = await tx.creditApplication.update({
        where: { id: app.id },
        data: { status: CreditStatus.LIBERADA },
      });
      return { application: updated, ledgerTransactionId: ledgerTx.id };
    });
  }

  private async getApp(id: string) {
    const app = await this.prisma.creditApplication.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Credit application not found');
    return app;
  }

  list(userId: string, isPrivileged: boolean) {
    return this.prisma.creditApplication.findMany({
      where: isPrivileged ? undefined : { userId },
      orderBy: { createdAt: 'desc' },
      include: { decisions: true, contract: true },
    });
  }

  async get(id: string) {
    const app = await this.prisma.creditApplication.findUnique({
      where: { id },
      include: { decisions: true, contract: { include: { installments: true } } },
    });
    if (!app) throw new NotFoundException('Credit application not found');
    return app;
  }

  async limits(userId: string, score?: number, faturamento = 0) {
    const s = await this.currentScore(userId, score);
    return { score: s, ...risk(s, faturamento) };
  }
}
