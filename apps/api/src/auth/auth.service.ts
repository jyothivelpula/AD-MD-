import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emails: EmailService,
  ) {}

  async signup(dto: SignupDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: dto.name,
      },
    });
    await this.sendVerification(user).catch(() => undefined);

    return this.buildAuthResponse(user);
  }

  async changeEmail(userId: string, email: string) {
    const next = email.trim().toLowerCase();
    const taken = await this.prisma.user.findFirst({ where: { email: next, NOT: { id: userId } } });
    if (taken) throw new ConflictException('Email already registered');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { email: next, emailVerified: false, emailVerifiedAt: null },
    });
    const result = await this.sendVerification(user).catch(() => ({ ok: false as const, error: 'Email could not be sent.' }));
    return {
      ...this.buildAuthResponse(user),
      emailVerified: false,
      verificationSent: result.ok,
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, emailVerified: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.emailVerified) return { emailVerified: true };
    const result = await this.sendVerification(user);
    if (!result.ok) return { sent: false, error: result.error };
    return { sent: true };
  }

  async verifyEmail(token: string) {
    try {
      const payload = this.jwtService.verify(token) as { sub?: string; email?: string; purpose?: string };
      if (payload.purpose !== 'verify-email' || !payload.sub || !payload.email) throw new Error('invalid');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.email !== payload.email) {
        return '<p>This verification link is no longer valid.</p>';
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      });
      return '<p>Your email is verified. You can close this page.</p>';
    } catch {
      return '<p>This verification link is no longer valid.</p>';
    }
  }

  private async sendVerification(user: { id: string; email: string; name: string }) {
    const message = this.emails.verificationMessage(user.id, user.email, user.name);
    return this.emails.sendEmail(message);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: { id: string; email: string; name: string }) {
    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }
}
