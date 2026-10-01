import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { AddNextActionDto } from './dto/add-next-action.dto.js';
import { MoveTaskDto } from './dto/move-task.dto.js';
import { MergeTaskDto } from './dto/merge-task.dto.js';
import { AddCommentDto } from './dto/add-comment.dto.js';

const attachmentUpload = FileInterceptor('file', {
  storage: diskStorage({
    destination: (req, _file, cb) => {
      const taskId = (req.params as Record<string, string>).id;
      const dir = join(process.cwd(), 'uploads', taskId);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file
});

@UseGuards(JwtAuthGuard)
@Controller('lists/:listId/tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Param('listId') listId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(user.id, listId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: { id: string }, @Param('listId') listId: string) {
    return this.tasksService.findAllForList(user.id, listId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.tasksService.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.id, id, dto);
  }

  @Post(':id/next-actions')
  addNextAction(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: AddNextActionDto,
  ) {
    return this.tasksService.addNextAction(user.id, id, dto);
  }

  @Patch(':id/next-actions/:entryId')
  updateNextAction(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: AddNextActionDto,
  ) {
    return this.tasksService.updateNextAction(user.id, id, entryId, dto);
  }

  @Delete(':id/next-actions/:entryId')
  removeNextAction(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('entryId') entryId: string,
  ) {
    return this.tasksService.removeNextAction(user.id, id, entryId);
  }

  @Post(':id/comments')
  addComment(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
  ) {
    return this.tasksService.addComment(user.id, id, dto);
  }

  @Delete(':id/comments/:commentId')
  removeComment(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.tasksService.removeComment(user.id, id, commentId);
  }

  @Post(':id/attachments')
  @UseInterceptors(attachmentUpload)
  uploadAttachment(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.tasksService.addAttachment(user.id, id, file);
  }

  @Delete(':id/attachments/:attachmentId')
  removeAttachment(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.tasksService.removeAttachment(user.id, id, attachmentId);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.tasksService.duplicate(user.id, id);
  }

  @Patch(':id/move')
  move(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasksService.move(user.id, id, dto);
  }

  @Post(':id/merge')
  merge(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: MergeTaskDto,
  ) {
    return this.tasksService.merge(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.tasksService.remove(user.id, id);
  }
}
