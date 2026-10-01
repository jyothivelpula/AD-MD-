import { Controller, Get, NotFoundException } from '@nestjs/common';
import { EmailService } from './email.service.js';

@Controller('email')
export class EmailOutboxController {
  constructor(private emails: EmailService) {}

  @Get('outbox')
  outbox() {
    if (process.env.EMAIL_DELIVERY !== 'log') throw new NotFoundException();
    return this.emails.outbox;
  }
}
