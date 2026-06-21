import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Audit } from '../../common/audit/audit.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { EducationService } from './education.service';

@Controller({ path: 'education', version: '1' })
export class EducationController {
  constructor(private readonly education: EducationService) {}

  @Get('videos')
  videos(@CurrentUser('id') userId: string) {
    return this.education.listVideos(userId);
  }

  @Post('videos/:code/watch')
  @HttpCode(HttpStatus.OK)
  @Audit('education.watch', 'education')
  watch(@CurrentUser('id') userId: string, @Param('code') code: string) {
    return this.education.watch(userId, code);
  }
}
