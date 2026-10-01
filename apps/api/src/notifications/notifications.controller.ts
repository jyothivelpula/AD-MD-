import { Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get('unread-count')
  unreadCount(@CurrentUser() user: { id: string }, @Query('workspaceId') workspaceId?: string) {
    return this.notifications.getUnreadCount(user.id, workspaceId);
  }

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query('workspaceId') workspaceId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
    @Query('q') q?: string,
  ) {
    return this.notifications.getUserNotifications(user.id, {
      workspaceId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      filter,
      q,
    });
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.notifications.deleteNotification(user.id, id);
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: { id: string }, @Query('workspaceId') workspaceId?: string) {
    return this.notifications.markAllNotificationsRead(user.id, workspaceId);
  }

  @Patch(':id/read')
  readOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.notifications.markNotificationRead(user.id, id);
  }
}
