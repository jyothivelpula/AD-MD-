import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationPreferencesController } from './notification-preferences.controller.js';
import { EmailModule } from '../email/email.module.js';
import { NotificationsService } from './notifications.service.js';
import { SmartNotificationsService } from './smart-notifications.service.js';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [NotificationsService, SmartNotificationsService],
  exports: [NotificationsService, SmartNotificationsService],
})
export class NotificationsModule {}
