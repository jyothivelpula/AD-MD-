import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';
import { SpacesModule } from './spaces/spaces.module.js';
import { ListsModule } from './lists/lists.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { CustomFieldsModule } from './custom-fields/custom-fields.module.js';
import { StatusesModule } from './statuses/statuses.module.js';
import { AiModule } from './ai/ai.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WorkspacesModule,
    SpacesModule,
    ListsModule,
    TasksModule,
    CustomFieldsModule,
    StatusesModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
