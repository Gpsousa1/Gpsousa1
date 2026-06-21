import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class EvaluateFraudDto {
  @IsOptional()
  @IsArray()
  operacoes?: { status: string }[];

  @IsOptional()
  @IsArray()
  transactions?: { tipo?: string; valor: number; data?: string }[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  faturamento?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tetoMEI?: number;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  @IsOptional()
  @IsString()
  cnpj?: string;
}

export class BlacklistEntryDto {
  @IsString()
  tipo: string; // CPF | CNPJ | DEVICE | EMAIL | IP

  @IsString()
  valor: string;

  @IsOptional()
  @IsString()
  motivo?: string;
}
