import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiToolsService } from './ai-tools.service.js';
import { AiProviderService } from './ai-provider.service.js';

@Module({
  imports: [AuthModule, NotificationsModule, EmailModule],
  controllers: [AiController],
  providers: [AiService, AiToolsService, AiProviderService],
})
export class AiModule {}
