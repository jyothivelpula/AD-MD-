import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMemberProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
