import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AiContextDto } from './ai-context.dto.js';

export class CreateAiChatDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AiContextDto)
  context?: AiContextDto;

  @IsOptional()
  @IsString()
  model?: string;
}
