import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Audit } from '../../common/audit/audit.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { CertificatesService } from './certificates.service';
import { EmitCertificateDto } from './dto/certificate.dto';

@Controller({ path: 'certificates', version: '1' })
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Post()
  @Audit('certificates.emit', 'certificates')
  emit(@CurrentUser('id') userId: string, @Body() dto: EmitCertificateDto) {
    return this.certificates.emit(userId, dto);
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.certificates.list(userId);
  }

  /** Public verification by SHA-256 hash. */
  @Public()
  @Get('verify/:hash')
  verify(@Param('hash') hash: string) {
    return this.certificates.verify(hash);
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.certificates.get(userId, id);
  }
}
