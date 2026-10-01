import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { TasksService } from './tasks.service.js';

class SendTaskEmailDto {
  @IsArray()
  @IsEmail({}, { each: true })
  to!: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  body!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskEmailController {
  constructor(private tasks: TasksService) {}

  @Get(':id')
  locate(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.tasks.locateTask(user.id, id);
  }

  @Post(':id/email')
  send(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: SendTaskEmailDto) {
    return this.tasks.sendTaskEmail(user.id, id, dto);
  }

  @Post(':id/emails/:emailId/retry')
  retry(@CurrentUser() user: { id: string }, @Param('id') id: string, @Param('emailId') emailId: string) {
    return this.tasks.retryTaskEmail(user.id, id, emailId);
  }
}
