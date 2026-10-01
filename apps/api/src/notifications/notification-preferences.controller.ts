import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';
import { UpdateNotificationPreferencesDto } from './notification-preferences.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  get(@CurrentUser() user: { id: string }) {
    return this.notifications.getPreferences(user.id);
  }

  @Put()
  update(@CurrentUser() user: { id: string }, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notifications.updatePreferences(user.id, dto);
  }
}
