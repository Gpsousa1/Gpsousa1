import { Injectable } from '@nestjs/common';
import { AdvisorKind } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { nivel, risk } from '../score/score.engine';

/**
 * Rule-based financial advisor (no external LLM connected). It consumes ONLY
 * the authenticated user's own authorized data (latest score snapshot,
 * missions, certificates, gamification). Every interaction is persisted in
 * advisor_interactions AND recorded in the audit trail.
 */
@Injectable()
export class AdvisorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async record(userId: string, kind: AdvisorKind, input: object, response: object) {
    await this.prisma.advisorInteraction.create({
      data: { userId, kind, input, response },
    });
    await this.audit.record({
      actorId: userId,
      action: `advisor.${kind.toLowerCase()}`,
      resource: 'advisor',
      meta: { kind },
    });
    return response;
  }

  private async context(userId: string) {
    const [snap, gam, missions, certs] = await Promise.all([
      this.prisma.scoreSnapshot.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { factors: true } }),
      this.prisma.meiGamification.findUnique({ where: { userId } }),
      this.prisma.missionProgress.findMany({ where: { userId } }),
      this.prisma.certificate.findMany({ where: { userId, active: true } }),
    ]);
    return { snap, gam, missions, certs };
  }

  async analyze(userId: string) {
    const { snap, gam, certs } = await this.context(userId);
    const total = snap?.total ?? 300;
    const nv = nivel(total);
    const r = risk(total);
    const recomendacoes: string[] = [];
    if (total < 600) recomendacoes.push('Registre receitas e mantenha regularidade de lançamentos para subir de Bronze.');
    if (certs.length === 0) recomendacoes.push('Emita o Certificado CCFV para fortalecer sua reputação e elevar o score.');
    if (!r.approved) recomendacoes.push('Seu score ainda não habilita crédito; conclua missões para evoluir.');

    return this.record(userId, AdvisorKind.ANALYSIS, { userId }, {
      score: total,
      nivel: nv.label,
      risco: r.level,
      limiteEstimado: r.limit,
      xp: gam?.xp ?? 0,
      certificadosAtivos: certs.length,
      recomendacoes,
    });
  }

  async interpretScore(userId: string) {
    const { snap } = await this.context(userId);
    const total = snap?.total ?? 300;
    const nv = nivel(total);
    const topFatores = (snap?.factors ?? [])
      .sort((a, b) => b.contribuicao - a.contribuicao)
      .slice(0, 3)
      .map((f) => ({ fator: f.fator, contribuicao: f.contribuicao }));
    return this.record(userId, AdvisorKind.SCORE_INTERPRETATION, { userId }, {
      score: total,
      nivel: nv.label,
      explicacao: `Seu score é ${total} (${nv.label}). Os fatores que mais contribuem são: ${topFatores.map((f) => f.fator).join(', ') || 'ainda sem atividade'}.`,
      topFatores,
    });
  }

  async creditGuidance(userId: string) {
    const { snap } = await this.context(userId);
    const total = snap?.total ?? 300;
    const r = risk(total);
    const orientacao = r.approved
      ? `Você pode solicitar até ${r.limit} com taxa ${r.rate} (risco ${r.level}).`
      : 'Seu score atual não habilita crédito. Conclua missões e emita o CCFV para evoluir.';
    return this.record(userId, AdvisorKind.CREDIT_GUIDANCE, { userId }, {
      aprovavel: r.approved,
      limite: r.limit,
      taxa: r.rate,
      risco: r.level,
      orientacao,
    });
  }

  async education(userId: string) {
    const [videos, watched] = await Promise.all([
      this.prisma.educationVideo.findMany(),
      this.prisma.educationProgress.findMany({ where: { userId } }),
    ]);
    const seen = new Set(watched.map((w) => w.videoCode));
    const sugeridos = videos.filter((v) => !seen.has(v.code)).map((v) => ({ code: v.code, titulo: v.titulo, xp: v.xp }));
    return this.record(userId, AdvisorKind.EDUCATION, { userId }, {
      sugeridos,
      mensagem: sugeridos.length
        ? 'Continue sua trilha de educação financeira para ganhar XP.'
        : 'Você concluiu todos os vídeos disponíveis. Parabéns!',
    });
  }

  history(userId: string, take = 50) {
    return this.prisma.advisorInteraction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    });
  }
}
