import { IsString, MinLength } from 'class-validator';

export class MoveTaskDto {
  @IsString()
  @MinLength(1)
  targetListId!: string;
}
