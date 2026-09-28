import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SpacesService } from './spaces.service.js';
import { CreateSpaceDto } from './dto/create-space.dto.js';
import { UpdateSpaceDto } from './dto/update-space.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/spaces')
export class SpacesController {
  constructor(private spacesService: SpacesService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateSpaceDto,
  ) {
    return this.spacesService.create(user.id, workspaceId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: { id: string }, @Param('workspaceId') workspaceId: string) {
    return this.spacesService.findAllForWorkspace(user.id, workspaceId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateSpaceDto,
  ) {
    return this.spacesService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.spacesService.remove(user.id, id);
  }
}
