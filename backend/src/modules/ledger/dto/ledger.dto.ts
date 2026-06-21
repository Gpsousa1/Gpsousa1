import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { LedgerEntryType } from '@prisma/client';

export class LedgerEntryDto {
  @IsString()
  accountCode: string;

  @IsEnum(LedgerEntryType)
  tipo: LedgerEntryType;

  @IsNumber()
  @Min(0)
  valor: number;

  @IsOptional()
  @IsString()
  descricao?: string;
}

export class PostLedgerDto {
  @IsOptional()
  @IsString()
  reference?: string;

  @IsString()
  descricao: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => LedgerEntryDto)
  entries: LedgerEntryDto[];
}
