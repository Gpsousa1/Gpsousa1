import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class IssueAttestationDto {
  // Cash-flow series (from Open Finance in production; payload until then).
  @IsOptional()
  @IsArray()
  transactions?: { tipo: 'RECEITA' | 'DESPESA'; valor: number; data: string }[];

  // CPF/CNPJ for bureau/SCR lookup (when a provider is connected).
  @IsOptional()
  @IsString()
  documento?: string;

  // Optional override of the behavioural score (else uses latest snapshot).
  @IsOptional()
  @IsInt()
  @Min(0)
  score?: number;
}

export class RecordOutcomeDto {
  @IsString()
  userId: string;

  @IsString()
  evento: string; // PAGAMENTO | INADIMPLENCIA | QUITACAO

  @IsOptional()
  @IsString()
  applicationId?: string;
}
