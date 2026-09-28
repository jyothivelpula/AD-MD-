import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ListsController } from './lists.controller.js';
import { ListsService } from './lists.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ListsController],
  providers: [ListsService],
})
export class ListsModule {}
