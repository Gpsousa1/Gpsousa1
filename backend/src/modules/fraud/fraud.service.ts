import { Injectable } from '@nestjs/common';
import { FraudNivel } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BlacklistEntryDto, EvaluateFraudDto } from './dto/fraud.dto';
import { calcRiskScore, nivelToEnum } from './fraud.engine';

interface EvalMeta {
  userId?: string;
  applicationId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class FraudService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs the canonical 5-rule risk score (unchanged from the frontend) and adds
   * the blacklist signal on top (additive). Persists fraud_event + fraud_score
   * so every decision is auditable.
   */
  async evaluate(dto: EvaluateFraudDto, meta: EvalMeta) {
    const result = calcRiskScore(
      dto.operacoes ?? [],
      dto.transactions ?? [],
      dto.faturamento ?? 0,
      dto.tetoMEI ?? 81000,
    );

    // Additive blacklist signal — never lowers risk, only blocks.
    const blacklisted = await this.isBlacklisted([
      { tipo: 'DEVICE', valor: dto.deviceId },
      { tipo: 'CPF', valor: dto.cpf },
      { tipo: 'CNPJ', valor: dto.cnpj },
      { tipo: 'IP', valor: meta.ip },
    ]);
    const flags = blacklisted ? [...result.flags, 'BLACKLIST'] : result.flags;
    const bloqueado = result.bloqueado || blacklisted;
    const nivel: FraudNivel = blacklisted ? FraudNivel.CRITICO : nivelToEnum(result.nivel);

    const event = await this.prisma.fraudEvent.create({
      data: {
        userId: meta.userId,
        applicationId: meta.applicationId,
        riskScore: result.riskScore,
        nivel,
        flags,
        bloqueado,
        alerta: result.alerta,
        deviceId: dto.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        context: { faturamento: dto.faturamento ?? 0, tetoMEI: dto.tetoMEI ?? 81000 },
      },
    });

    if (meta.userId) {
      await this.prisma.fraudScore.create({
        data: { userId: meta.userId, riskScore: result.riskScore, nivel, flags },
      });
    }

    return {
      riskScore: result.riskScore,
      flags,
      bloqueado,
      alerta: result.alerta,
      nivel,
      blacklisted,
      eventId: event.id,
    };
  }

  private async isBlacklisted(items: { tipo: string; valor?: string | null }[]) {
    const valid = items.filter((i) => i.valor) as { tipo: string; valor: string }[];
    if (valid.length === 0) return false;
    const hit = await this.prisma.fraudBlacklist.findFirst({
      where: { OR: valid.map((i) => ({ tipo: i.tipo, valor: i.valor })) },
    });
    return !!hit;
  }

  listRules() {
    return this.prisma.fraudRule.findMany({ orderBy: { code: 'asc' } });
  }

  listEvents(take = 50) {
    return this.prisma.fraudEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    });
  }

  listScores(userId?: string, take = 50) {
    return this.prisma.fraudScore.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    });
  }

  addBlacklist(dto: BlacklistEntryDto) {
    return this.prisma.fraudBlacklist.upsert({
      where: { tipo_valor: { tipo: dto.tipo, valor: dto.valor } },
      update: { motivo: dto.motivo },
      create: dto,
    });
  }

  listBlacklist() {
    return this.prisma.fraudBlacklist.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
