import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiToolsService } from './ai-tools.service.js';
import { AiProviderService } from './ai-provider.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, AiToolsService, AiProviderService],
})
export class AiModule {}
