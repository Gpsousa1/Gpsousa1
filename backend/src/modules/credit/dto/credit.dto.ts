import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class SimulateCreditDto {
  @IsNumber()
  @Min(1)
  valor: number;

  @IsInt()
  @Min(1)
  parcelas: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxaMensal?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  score?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  faturamento?: number;
}

export class RequestCreditDto {
  @IsNumber()
  @Min(1)
  valor: number;

  @IsInt()
  @Min(1)
  parcelas: number;

  @IsOptional()
  @IsString()
  finalidade?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  score?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  faturamento?: number;

  // Fraud-engine context (same shape as the frontend state).
  @IsOptional()
  @IsArray()
  transactions?: { tipo?: string; valor: number; data?: string }[];

  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class ApproveCreditDto {
  @IsNumber()
  @Min(0)
  taxaJuros: number;
}

export class RejectCreditDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}
