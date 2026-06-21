import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/** Activity snapshot fed to the triggers (mirrors the frontend state). */
export class EvaluateMissionsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  receitaCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  txCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dasnCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dasPagamentosCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  nfCount?: number;

  // Optional override; if omitted, derived from the user's active CCFV certs.
  @IsOptional()
  @IsBoolean()
  ccfvEmitted?: boolean;
}
