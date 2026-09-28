import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export const STATUS_TYPES = ['open', 'in_progress', 'done'] as const;

export class CreateStatusDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsIn(STATUS_TYPES as unknown as string[])
  type?: string;
}
