import { IsString, MinLength } from 'class-validator';

export class UpdateAiChatDto {
  @IsString()
  @MinLength(1)
  title!: string;
}
