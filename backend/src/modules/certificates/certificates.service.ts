import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CertType } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { MissionsService } from '../missions/missions.service';
import { EmitCertificateDto } from './dto/certificate.dto';
import {
  buildCertHash,
  certBonus,
  CERT_A1_PRICES,
  expiraEm,
} from './certificate.engine';

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
    private readonly missions: MissionsService,
  ) {}

  async emit(userId: string, dto: EmitCertificateDto) {
    // Dedupe: one active certificate per type (EMIT_CERT: jaTemTipo).
    const existing = await this.prisma.certificate.findFirst({
      where: { userId, tipo: dto.tipo, active: true },
    });
    if (existing) {
      throw new ConflictException(`Active ${dto.tipo} certificate already exists`);
    }

    const emitidoEm = new Date();
    const valor =
      dto.tipo === CertType.A1 && dto.validity
        ? (CERT_A1_PRICES[dto.validity] ?? 0)
        : 0;

    const cert = await this.prisma.certificate.create({
      data: {
        userId,
        tipo: dto.tipo,
        validity: dto.validity,
        valor,
        hash: buildCertHash({ userId, tipo: dto.tipo, emitidoEm }),
        emitidoEm,
        expiraEm: expiraEm(dto.tipo, emitidoEm),
      },
    });

    // certBonus added to the credit-bonus accumulator (EMIT_CERT).
    const bonus = certBonus(dto.tipo);
    await this.gamification.addCreditBonus(userId, bonus);

    // Emitting a CCFV auto-completes mission 5 (EMIT_CERT -> withAutoMissions).
    let missionXp = 0;
    if (dto.tipo === CertType.CCFV) {
      missionXp = await this.missions.completeCcfvMission(userId);
    }

    return { certificate: cert, certBonus: bonus, missionXp };
  }

  async list(userId: string) {
    return this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { emitidoEm: 'desc' },
    });
  }

  async get(userId: string, id: string) {
    const cert = await this.prisma.certificate.findFirst({ where: { id, userId } });
    if (!cert) throw new NotFoundException('Certificate not found');
    return cert;
  }

  /** Public verification by hash (no auth). */
  async verify(hash: string) {
    const cert = await this.prisma.certificate.findUnique({ where: { hash } });
    if (!cert) {
      return { valid: false };
    }
    const expired = cert.expiraEm ? cert.expiraEm.getTime() < Date.now() : false;
    return {
      valid: cert.active && cert.status === 'ATIVO' && !expired,
      tipo: cert.tipo,
      emitidoEm: cert.emitidoEm,
      expiraEm: cert.expiraEm,
      status: cert.status,
    };
  }
}
