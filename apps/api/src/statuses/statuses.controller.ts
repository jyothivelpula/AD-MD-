import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { StatusesService } from './statuses.service.js';
import { CreateStatusDto } from './dto/create-status.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/statuses')
export class StatusesController {
  constructor(private statusesService: StatusesService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.statusesService.create(user.id, spaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.statusesService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.statusesService.remove(user.id, id);
  }
}
