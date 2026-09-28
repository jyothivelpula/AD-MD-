import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CustomFieldsController } from './custom-fields.controller.js';
import { CustomFieldsService } from './custom-fields.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService],
})
export class CustomFieldsModule {}
