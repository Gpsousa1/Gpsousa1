import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';

@Injectable()
export class EducationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  async listVideos(userId: string) {
    const catalog = await this.prisma.educationVideo.findMany();
    const watched = await this.prisma.educationProgress.findMany({ where: { userId } });
    const seen = new Set(watched.map((w) => w.videoCode));
    return catalog.map((v) => ({ ...v, watched: seen.has(v.code) }));
  }

  /**
   * Marks a video as watched and credits its XP (WATCH_VIDEO).
   * Idempotent: re-watching does not credit XP again (eduAssistidos dedupe).
   */
  async watch(userId: string, code: string) {
    const video = await this.prisma.educationVideo.findUnique({ where: { code } });
    if (!video) throw new NotFoundException('Video not found');

    const already = await this.prisma.educationProgress.findUnique({
      where: { userId_videoCode: { userId, videoCode: code } },
    });
    if (already) {
      return { watched: true, xpGained: 0, alreadyWatched: true };
    }

    await this.prisma.educationProgress.create({ data: { userId, videoCode: code } });
    await this.gamification.addXp(userId, video.xp);
    return { watched: true, xpGained: video.xp, alreadyWatched: false };
  }
}
