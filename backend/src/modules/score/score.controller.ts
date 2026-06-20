import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Audit } from '../../common/audit/audit.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CalculateScoreDto } from './dto/score.dto';
import { ScoreService } from './score.service';

@Controller({ path: 'score', version: '1' })
export class ScoreController {
  constructor(private readonly score: ScoreService) {}

  /** Stateless calculation (no persistence) — pure engine. */
  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  calculate(@Body() dto: CalculateScoreDto) {
    return this.score.calculate(dto);
  }

  /** Calculate + persist an immutable snapshot for the authenticated user. */
  @Post('snapshot')
  @Audit('score.snapshot', 'score')
  snapshot(@CurrentUser('id') userId: string, @Body() dto: CalculateScoreDto) {
    return this.score.snapshot(userId, dto);
  }

  /** Latest snapshot — the endpoint the frontend references as GET /score/me. */
  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.score.me(userId);
  }

  @Get('history')
  history(@CurrentUser('id') userId: string, @Query('take') take?: string) {
    return this.score.history(userId, take ? parseInt(take, 10) : undefined);
  }
}
