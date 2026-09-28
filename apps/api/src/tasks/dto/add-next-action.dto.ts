import { IsString, MinLength } from 'class-validator';

export class AddNextActionDto {
  @IsString()
  @MinLength(1)
  text!: string;
}
