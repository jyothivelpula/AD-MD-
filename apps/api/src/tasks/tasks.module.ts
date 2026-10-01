import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TasksController } from './tasks.controller.js';
import { TaskEmailController } from './task-email.controller.js';
import { SpacePeopleTasksController } from './space-people-tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [AuthModule, NotificationsModule, EmailModule],
  controllers: [TasksController, TaskEmailController, SpacePeopleTasksController],
  providers: [TasksService],
})
export class TasksModule {}
