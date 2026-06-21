import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AdvisorService } from './advisor.service';

@Controller({ path: 'advisor', version: '1' })
export class AdvisorController {
  constructor(private readonly advisor: AdvisorService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  analyze(@CurrentUser('id') userId: string) {
    return this.advisor.analyze(userId);
  }

  @Post('score-interpretation')
  @HttpCode(HttpStatus.OK)
  interpret(@CurrentUser('id') userId: string) {
    return this.advisor.interpretScore(userId);
  }

  @Post('credit-guidance')
  @HttpCode(HttpStatus.OK)
  creditGuidance(@CurrentUser('id') userId: string) {
    return this.advisor.creditGuidance(userId);
  }

  @Post('education')
  @HttpCode(HttpStatus.OK)
  education(@CurrentUser('id') userId: string) {
    return this.advisor.education(userId);
  }

  @Get('history')
  history(@CurrentUser('id') userId: string, @Query('take') take?: string) {
    return this.advisor.history(userId, take ? parseInt(take, 10) : undefined);
  }
}
