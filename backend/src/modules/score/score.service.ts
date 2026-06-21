import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { CalculateScoreDto } from './dto/score.dto';
import { calcScore, nivel, risk, ScoreResult } from './score.engine';

const SCORE_CACHE_TTL = 60; // seconds

@Injectable()
export class ScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private cacheKey(userId: string) {
    return `score:me:${userId}`;
  }

  /** Pure, stateless calculation — exact replica of the frontend engine. */
  calculate(dto: CalculateScoreDto) {
    const result: ScoreResult = calcScore(
      dto.transactions ?? [],
      dto.missions ?? [],
      Array.from({ length: dto.dasnCount ?? 0 }),
      dto.certs ?? [],
      Array.from({ length: dto.notasFiscaisCount ?? 0 }),
      {
        xp: dto.xp ?? 0,
        dasPagamentos: Array.from({ length: dto.dasPagamentosCount ?? 0 }),
        createdAt: dto.createdAt ?? null,
        openFinance: dto.openFinance ?? null,
        fraudFlags: Array.from({ length: dto.fraudFlagsCount ?? 0 }),
      },
    );

    const nv = nivel(result.total);
    return {
      ...result,
      nivel: nv,
      risk: risk(result.total, dto.faturamento ?? 0),
    };
  }

  /** Calculates and persists an immutable score snapshot (history). */
  async snapshot(userId: string, dto: CalculateScoreDto, motivo = 'RECALCULO') {
    const calc = this.calculate(dto);
    const snapshot = await this.prisma.scoreSnapshot.create({
      data: {
        userId,
        total: calc.total,
        tier: calc.nivel.tier,
        raw: calc.raw,
        version: calc.version,
        motivo,
        factors: {
          create: calc.explicacao.map((f) => ({
            fator: f.fator,
            valor: f.valor,
            contribuicao: f.contribuicao,
          })),
        },
      },
      include: { factors: true },
    });
    // New snapshot invalidates the cached "me" view.
    await this.redis.del(this.cacheKey(userId));
    return { ...calc, snapshotId: snapshot.id, createdAt: snapshot.createdAt };
  }

  async me(userId: string) {
    const cached = await this.redis.getJson<object>(this.cacheKey(userId));
    if (cached) return cached;

    const latest = await this.prisma.scoreSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { factors: true },
    });
    if (!latest) {
      throw new NotFoundException('No score snapshot yet for this user');
    }
    await this.redis.setJson(this.cacheKey(userId), latest, SCORE_CACHE_TTL);
    return latest;
  }

  async history(userId: string, take = 90) {
    return this.prisma.scoreSnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 90),
      select: { id: true, total: true, tier: true, motivo: true, createdAt: true },
    });
  }
}
