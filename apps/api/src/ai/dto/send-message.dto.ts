import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { AiContextDto } from './ai-context.dto.js';

export class AiComposerAttachmentDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  size?: number;

  @IsOptional()
  @IsString()
  text?: string;
}

export class SendAiMessageDto {
  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AiContextDto)
  context?: AiContextDto;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  listIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  links?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiComposerAttachmentDto)
  attachments?: AiComposerAttachmentDto[];
}
