import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AiService } from './ai.service.js';
import { CreateAiChatDto } from './dto/create-chat.dto.js';
import { SendAiMessageDto } from './dto/send-message.dto.js';
import { UpdateAiChatDto } from './dto/update-chat.dto.js';

@Controller('workspaces/:workspaceId/ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private ai: AiService) {}

  @Get('status')
  status() {
    return this.ai.status();
  }

  @Get('context-tree')
  contextTree(@CurrentUser() user: { id: string }, @Param('workspaceId') workspaceId: string) {
    return this.ai.contextTree(user.id, workspaceId);
  }

  @Get('picker')
  picker(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Query('q') q?: string,
  ) {
    return this.ai.picker(user.id, workspaceId, q);
  }

  @Get('daily-brief')
  dailyBrief(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Query('generate') generate?: string,
  ) {
    return this.ai.dailyBrief(user.id, workspaceId, generate === '1');
  }

  @Post('daily-brief/refresh')
  refreshDailyBrief(@CurrentUser() user: { id: string }, @Param('workspaceId') workspaceId: string) {
    return this.ai.dailyBrief(user.id, workspaceId, true);
  }

  @Get('chats')
  listChats(@CurrentUser() user: { id: string }, @Param('workspaceId') workspaceId: string) {
    return this.ai.listChats(user.id, workspaceId);
  }

  @Post('chats')
  createChat(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateAiChatDto,
  ) {
    return this.ai.createChat(user.id, workspaceId, dto);
  }

  @Get('chats/:chatId')
  getChat(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Param('chatId') chatId: string,
  ) {
    return this.ai.getChat(user.id, workspaceId, chatId);
  }

  @Patch('chats/:chatId')
  renameChat(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Param('chatId') chatId: string,
    @Body() dto: UpdateAiChatDto,
  ) {
    return this.ai.renameChat(user.id, workspaceId, chatId, dto.title);
  }

  @Delete('chats/:chatId')
  deleteChat(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Param('chatId') chatId: string,
  ) {
    return this.ai.deleteChat(user.id, workspaceId, chatId);
  }

  @Post('chats/:chatId/messages')
  sendMessage(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Param('chatId') chatId: string,
    @Body() dto: SendAiMessageDto,
  ) {
    return this.ai.sendMessage(user.id, workspaceId, chatId, dto);
  }
}
