import { IsString, MinLength } from 'class-validator';

export class MergeTaskDto {
  @IsString()
  @MinLength(1)
  targetTaskId!: string;
}
