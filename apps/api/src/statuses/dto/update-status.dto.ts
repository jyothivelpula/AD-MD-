import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { STATUS_TYPES } from './create-status.dto.js';

export class UpdateStatusDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsIn(STATUS_TYPES as unknown as string[])
  type?: string;
}
