import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConsentStatus, OfAccountSync } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  OPEN_FINANCE_PROVIDER,
  OpenFinanceProvider,
} from './open-finance.provider';

@Injectable()
export class OpenFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OPEN_FINANCE_PROVIDER) private readonly provider: OpenFinanceProvider,
  ) {}

  /** Creates a local consent record (PENDING). Provider hookup is future work. */
  async createConsent(userId: string, scopes: string[]) {
    return this.prisma.ofConsent.create({
      data: {
        userId,
        provider: this.provider.name,
        scopes,
        status: ConsentStatus.PENDING,
      },
    });
  }

  listConsents(userId: string) {
    return this.prisma.ofConsent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { syncs: true },
    });
  }

  async revoke(userId: string, id: string) {
    await this.assertOwned(userId, id);
    return this.prisma.ofConsent.update({
      where: { id },
      data: { status: ConsentStatus.REVOKED },
    });
  }

  /** Account sync delegates to the provider (currently Noop → not connected). */
  async sync(userId: string, id: string) {
    const consent = await this.assertOwned(userId, id);
    const accounts = await this.provider.fetchAccounts(consent.externalConsentId ?? '');
    const created: OfAccountSync[] = [];
    for (const acc of accounts) {
      created.push(
        await this.prisma.ofAccountSync.create({
          data: {
            consentId: consent.id,
            accountRef: acc.accountRef,
            status: 'SYNCED',
            lastSyncAt: new Date(),
            payload: acc.payload as object,
          },
        }),
      );
    }
    return created;
  }

  private async assertOwned(userId: string, id: string) {
    const consent = await this.prisma.ofConsent.findFirst({ where: { id, userId } });
    if (!consent) throw new NotFoundException('Consent not found');
    return consent;
  }
}
