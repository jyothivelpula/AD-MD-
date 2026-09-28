import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/people')
export class SpacePeopleTasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  listPeople(@CurrentUser() user: { id: string }, @Param('spaceId') spaceId: string) {
    return this.tasksService.listPeople(user.id, spaceId);
  }

  @Get(':personKey/tasks')
  findAssigned(
    @CurrentUser() user: { id: string },
    @Param('spaceId') spaceId: string,
    @Param('personKey') personKey: string,
  ) {
    return this.tasksService.findAssignedInSpace(user.id, spaceId, personKey);
  }

  @Post(':personKey/tasks')
  createForPerson(
    @CurrentUser() user: { id: string },
    @Param('spaceId') spaceId: string,
    @Param('personKey') personKey: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.createForPerson(user.id, spaceId, personKey, dto);
  }
}
