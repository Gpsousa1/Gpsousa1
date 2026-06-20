import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

class OpenFinanceDto {
  @IsOptional()
  @IsBoolean()
  connected?: boolean;
}

/**
 * Inputs for the Score Engine. Finance/fiscal data is supplied by the caller
 * because those domains belong to other phases — only the ENGINE is migrated.
 */
export class CalculateScoreDto {
  @IsOptional()
  @IsArray()
  transactions?: { tipo: 'RECEITA' | 'DESPESA'; valor: number }[];

  @IsOptional()
  @IsArray()
  missions?: { done?: boolean }[];

  @IsOptional()
  @IsInt()
  @Min(0)
  dasnCount?: number;

  @IsOptional()
  @IsArray()
  certs?: { active?: boolean }[];

  @IsOptional()
  @IsInt()
  @Min(0)
  notasFiscaisCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  xp?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dasPagamentosCount?: number;

  @IsOptional()
  @IsString()
  createdAt?: string;

  @IsOptional()
  @Type(() => OpenFinanceDto)
  openFinance?: OpenFinanceDto;

  // Fraud Engine is out of scope (FASE 3+): defaults to "no flags" so the
  // semFraudes factor scores 100, identical to the no-fraud frontend case.
  @IsOptional()
  @IsInt()
  @Min(0)
  fraudFlagsCount?: number;

  @IsOptional()
  @IsNumber()
  faturamento?: number;
}
