import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CertType } from '@prisma/client';

export class EmitCertificateDto {
  @IsEnum(CertType)
  tipo: CertType;

  // For A1: '1ano' | '2anos' | '3anos' (see CERT_A1_PRICES).
  @IsOptional()
  @IsString()
  validity?: string;
}
