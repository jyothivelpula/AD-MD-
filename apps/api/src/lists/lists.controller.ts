import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ListsService } from './lists.service.js';
import { CreateListDto } from './dto/create-list.dto.js';
import { UpdateListDto } from './dto/update-list.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/lists')
export class ListsController {
  constructor(private listsService: ListsService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateListDto,
  ) {
    return this.listsService.create(user.id, spaceId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: { id: string }, @Param('spaceId') spaceId: string) {
    return this.listsService.findAllForSpace(user.id, spaceId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateListDto,
  ) {
    return this.listsService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.listsService.remove(user.id, id);
  }
}
