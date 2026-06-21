import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PIX_PROVIDER, PixProvider } from './pix.provider';

@Injectable()
export class PixService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PIX_PROVIDER) private readonly provider: PixProvider,
  ) {}

  /**
   * Creates a local PIX charge. The BR Code / e2eId come from the PSP once a
   * provider is connected; for now the charge is persisted as ATIVA without a
   * BR Code (integration layer only).
   */
  async createCharge(userId: string, valor: number, expiresInSec = 3600) {
    const txid = randomUUID().replace(/-/g, '');
    return this.prisma.pixCharge.create({
      data: {
        userId,
        txid,
        valor,
        expiresAt: new Date(Date.now() + expiresInSec * 1000),
      },
    });
  }

  async getCharge(txid: string) {
    const charge = await this.prisma.pixCharge.findUnique({ where: { txid } });
    if (!charge) throw new NotFoundException('PIX charge not found');
    return charge;
  }

  listCharges(userId: string) {
    return this.prisma.pixCharge.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTransfer(userId: string, valor: number, pixKey: string) {
    return this.prisma.pixTransfer.create({
      data: { userId, valor, pixKey },
    });
  }

  /** Stores incoming webhooks for later processing (PSP not connected yet). */
  async handleWebhook(provider: string, event: string, payload: Record<string, unknown>) {
    const webhook = await this.prisma.pixWebhook.create({
      data: { provider, event, payload: payload as object },
    });
    return { received: true, id: webhook.id };
  }
}
