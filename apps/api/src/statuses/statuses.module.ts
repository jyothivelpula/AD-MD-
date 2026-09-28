import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StatusesController } from './statuses.controller.js';
import { StatusesService } from './statuses.service.js';

@Module({
  imports: [AuthModule],
  controllers: [StatusesController],
  providers: [StatusesService],
})
export class StatusesModule {}
