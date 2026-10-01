import { Body, Controller, Get, Header, Post, Query, UseGuards } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { AuthService } from './auth.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';

class ChangeEmailDto {
  @IsEmail()
  email!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('email')
  changeEmail(@CurrentUser() user: { id: string }, @Body() dto: ChangeEmailDto) {
    return this.authService.changeEmail(user.id, dto.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post('email/verification')
  resend(@CurrentUser() user: { id: string }) {
    return this.authService.resendVerification(user.id);
  }

  @Get('email/verify')
  @Header('Content-Type', 'text/html')
  verify(@Query('token') token = '') {
    return this.authService.verifyEmail(token);
  }
}
