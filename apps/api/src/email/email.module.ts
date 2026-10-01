import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EmailService } from './email.service.js';
import { EmailOutboxController } from './email.controller.js';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: '2d' },
    }),
  ],
  controllers: [EmailOutboxController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
