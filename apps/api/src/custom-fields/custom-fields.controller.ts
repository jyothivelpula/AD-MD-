import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CustomFieldsService } from './custom-fields.service.js';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/custom-fields')
export class CustomFieldsController {
  constructor(private customFieldsService: CustomFieldsService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateCustomFieldDto,
  ) {
    return this.customFieldsService.create(user.id, spaceId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: { id: string }, @Param('spaceId') spaceId: string) {
    return this.customFieldsService.findAllForSpace(user.id, spaceId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.customFieldsService.remove(user.id, id);
  }
}
