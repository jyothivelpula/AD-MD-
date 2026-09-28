import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'dropdown', 'checkbox'] as const;

export class CreateCustomFieldDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(CUSTOM_FIELD_TYPES as unknown as string[])
  type!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
