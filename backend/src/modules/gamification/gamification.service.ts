import { Injectable } from '@nestjs/common';
import { MeiGamification } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Holds the per-user accumulators that the frontend kept on `user.xp` and
 * `user.creditBonus`. Missions, certificates and education all feed into it.
 */
@Injectable()
export class GamificationService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(userId: string): Promise<MeiGamification> {
    return this.prisma.meiGamification.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async get(userId: string): Promise<MeiGamification> {
    return this.ensure(userId);
  }

  async addXp(userId: string, amount: number): Promise<MeiGamification> {
    await this.ensure(userId);
    return this.prisma.meiGamification.update({
      where: { userId },
      data: { xp: { increment: amount } },
    });
  }

  async addCreditBonus(userId: string, amount: number): Promise<MeiGamification> {
    await this.ensure(userId);
    return this.prisma.meiGamification.update({
      where: { userId },
      data: { creditBonus: { increment: amount } },
    });
  }

  async setPlano(userId: string, plano: string): Promise<MeiGamification> {
    await this.ensure(userId);
    return this.prisma.meiGamification.update({
      where: { userId },
      data: { plano },
    });
  }
}
