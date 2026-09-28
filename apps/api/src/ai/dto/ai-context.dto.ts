import { IsIn, IsOptional, IsString } from 'class-validator';

export class AiContextDto {
  @IsIn(['workspace', 'space', 'list', 'person', 'task'])
  type!: 'workspace' | 'space' | 'list' | 'person' | 'task';

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  spaceId?: string;

  @IsOptional()
  @IsString()
  listId?: string;
}
