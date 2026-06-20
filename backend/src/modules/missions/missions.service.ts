import { Injectable } from '@nestjs/common';
import { CertType } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { EvaluateMissionsDto } from './dto/mission.dto';
import { evaluateMissions, MissionState } from './mission.engine';

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  /** Returns the catalog merged with the user's progress (creating rows lazily). */
  async listForUser(userId: string) {
    const catalog = await this.prisma.mission.findMany({ orderBy: { code: 'asc' } });
    const progress = await this.prisma.missionProgress.findMany({ where: { userId } });
    const byCode = new Map(progress.map((p) => [p.missionCode, p]));
    return catalog.map((m) => ({
      ...m,
      done: byCode.get(m.code)?.done ?? false,
      doneAt: byCode.get(m.code)?.doneAt ?? null,
    }));
  }

  async evaluate(userId: string, dto: EvaluateMissionsDto) {
    const catalog = await this.prisma.mission.findMany({ orderBy: { code: 'asc' } });
    const progress = await this.prisma.missionProgress.findMany({ where: { userId } });
    const byCode = new Map(progress.map((p) => [p.missionCode, p]));

    const missions: MissionState[] = catalog.map((m) => ({
      code: m.code,
      xp: m.xp,
      done: byCode.get(m.code)?.done ?? false,
    }));

    // mission 5 (CCFV) trigger can come from the body or from persisted certs.
    let ccfvEmitted = dto.ccfvEmitted ?? false;
    if (!ccfvEmitted) {
      const ccfv = await this.prisma.certificate.findFirst({
        where: { userId, tipo: CertType.CCFV, active: true },
      });
      ccfvEmitted = !!ccfv;
    }

    const { plano } = await this.gamification.get(userId);

    const result = evaluateMissions(
      missions,
      {
        receitaCount: dto.receitaCount ?? 0,
        txCount: dto.txCount ?? 0,
        dasnCount: dto.dasnCount ?? 0,
        dasPagamentosCount: dto.dasPagamentosCount ?? 0,
        ccfvEmitted,
        nfCount: dto.nfCount ?? 0,
      },
      plano,
    );

    // Persist newly completed missions and accrue XP.
    const now = new Date();
    for (const code of result.completedCodes) {
      await this.prisma.missionProgress.upsert({
        where: { userId_missionCode: { userId, missionCode: code } },
        update: { done: true, doneAt: now },
        create: { userId, missionCode: code, done: true, doneAt: now },
      });
    }
    if (result.xpGained > 0) {
      await this.gamification.addXp(userId, result.xpGained);
    }

    return {
      completedCodes: result.completedCodes,
      xpGained: result.xpGained,
      missions: await this.listForUser(userId),
    };
  }

  /** Used by the certificate flow to mark mission 5 done when a CCFV is emitted. */
  async completeCcfvMission(userId: string): Promise<number> {
    return (await this.evaluate(userId, { ccfvEmitted: true })).xpGained;
  }
}
