import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service.js';

export type OutboundEmail = {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text: string;
};

type SendResult = { ok: true; messageId: string } | { ok: false; error: string };

function smtpSettings() {
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').replace(/\s/g, '');
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  return { user, pass, host, port, enabled: Boolean(user && pass) };
}

function formatFrom(address: string) {
  const name = (process.env.EMAIL_FROM_NAME || '').trim();
  if (name && address) return `${name} <${address}>`;
  return address;
}

function configuredFrom(smtpUser = '') {
  const address = (smtpUser || process.env.EMAIL_FROM || process.env.EMAIL_FROM_ADDRESS || '').trim();
  return formatFrom(address);
}

function emailTestMode() {
  return process.env.EMAIL_TEST_MODE === 'true' || process.env.EMAIL_DELIVERY === 'log';
}

const EMAIL_PREF_BY_TYPE: Record<string, string> = {
  TASK_ASSIGNED: 'emailTaskAssigned',
  TASK_REASSIGNED: 'emailTaskReassigned',
  TASK_DUE_TODAY: 'emailTaskDueToday',
  TASK_DUE_TOMORROW: 'emailTaskDueTomorrow',
  TASK_OVERDUE: 'emailTaskOverdue',
  TASK_COMMENT: 'emailTaskComment',
  TASK_MENTION: 'emailTaskMention',
  TASK_STATUS_CHANGED: 'emailTaskStatusChanged',
  TASK_PRIORITY_CHANGED: 'emailTaskPriorityChanged',
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  readonly outbox: OutboundEmail[] = [];

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  webUrl() {
    return (process.env.APP_WEB_URL || 'http://localhost:3010').replace(/\/$/, '');
  }

  taskUrl(taskId: string) {
    return `${this.webUrl()}/?taskId=${encodeURIComponent(taskId)}`;
  }

  async sendEmail(message: OutboundEmail): Promise<SendResult> {
    const to = message.to.map((item) => item.trim()).filter(Boolean);
    const cc = (message.cc || []).map((item) => item.trim()).filter(Boolean);
    const smtp = smtpSettings();
    const from = configuredFrom(smtp.enabled ? smtp.user : '');
    const apiKey = (process.env.EMAIL_API_KEY || process.env.EMAIL_PROVIDER_API_KEY || '').trim();
    const testMode = emailTestMode();
    this.logger.log(`[EMAIL] Recipient: ${to.join(', ') || '(none)'}`);
    this.logger.log(`[EMAIL] From: ${from || '(not configured)'}`);
    this.logger.log(`[EMAIL] Subject: ${message.subject}`);
    this.logger.log(`[EMAIL] Provider: ${smtp.enabled ? 'Gmail SMTP' : 'Resend'}`);
    this.logger.log(`[EMAIL] Test mode: ${testMode}`);
    if (!to.length || to.some((item) => !item.includes('@')) || cc.some((item) => !item.includes('@'))) {
      return { ok: false, error: 'Email failed to send. The recipient address is not valid.' };
    }
    if (testMode) {
      this.logger.warn('[EMAIL] Provider response: simulated');
      return { ok: false, error: 'Email was simulated and was NOT delivered.' };
    }
    if (smtp.enabled) return this.sendViaSmtp(smtp, { from, to, cc, subject: message.subject, html: message.html, text: message.text });
    const missing = [
      ...(!apiKey ? ['EMAIL_API_KEY'] : []),
      ...(!from ? ['EMAIL_FROM'] : []),
    ];
    if (missing.length) {
      const error = `Email failed to send. Missing ${missing.join(' and ')}.`;
      this.logger.warn(`[EMAIL] Provider response: not sent. ${error}`);
      return { ok: false, error };
    }
    this.logger.log('[EMAIL] Sending...');
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, cc: cc.length ? cc : undefined, subject: message.subject, html: message.html, text: message.text }),
        signal: AbortSignal.timeout(12000),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      this.logger.log(`[EMAIL] Provider response: ${res.status}`);
      if (!res.ok || !data.id) {
        const error = data.message || `Email failed to send. The provider returned ${res.status}.`;
        this.logger.warn(`[EMAIL] Provider response: ${res.status} ${error}`);
        return { ok: false, error };
      }
      this.logger.log(`[EMAIL] Message ID: ${data.id}`);
      return { ok: true, messageId: data.id };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`[EMAIL] Provider response: failed ${error}`);
      return { ok: false, error: 'Email failed to send. The provider could not be reached.' };
    }
  }

  private async sendViaSmtp(
    smtp: { user: string; pass: string; host: string; port: number },
    message: { from: string; to: string[]; cc: string[]; subject: string; html: string; text: string },
  ): Promise<SendResult> {
    this.logger.log('[EMAIL] Sending...');
    try {
      const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
        connectionTimeout: 12000,
        greetingTimeout: 12000,
        socketTimeout: 12000,
      });
      const info = await transport.sendMail({
        from: message.from,
        to: message.to,
        cc: message.cc.length ? message.cc : undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      const rejected = (info.rejected || []).map((item) => String(item));
      const accepted = (info.accepted || []).map((item) => String(item));
      this.logger.log(`[EMAIL] Provider response: ${rejected.length ? 'rejected' : 'accepted'}`);
      if (!info.messageId || rejected.length || !accepted.length) {
        const error = rejected.length
          ? `Email failed to send. The provider rejected ${rejected.join(', ')}.`
          : 'Email failed to send. The provider did not accept the message.';
        this.logger.warn(`[EMAIL] Provider response: ${error}`);
        return { ok: false, error };
      }
      this.logger.log(`[EMAIL] Message ID: ${info.messageId}`);
      return { ok: true, messageId: info.messageId };
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`[EMAIL] Provider response: failed ${detail}`);
      const loginRejected = /535|username and password|invalid login|badcredentials/i.test(detail);
      return {
        ok: false,
        error: loginRejected
          ? 'Email failed to send. Gmail rejected the login. Use a Gmail app password in SMTP_PASS.'
          : 'Email failed to send. The provider could not be reached.',
      };
    }
  }

  async deliverNotification(notification: {
    id: string;
    userId: string;
    workspaceId: string;
    taskId: string | null;
    type: string;
    title: string;
    message: string;
    actorId: string | null;
  }) {
    const field = EMAIL_PREF_BY_TYPE[notification.type];
    if (!field || !notification.taskId) return null;
    const [user, prefs, task] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: notification.userId }, select: { id: true, email: true, emailVerified: true, name: true } }),
      this.prisma.notificationPreference.findUnique({ where: { userId: notification.userId } }),
      this.taskFacts(notification.taskId),
    ]);
    const enabled = prefs ? Boolean((prefs as unknown as Record<string, unknown>)[field]) : true;
    if (!enabled || !user?.emailVerified || !user.email || !task) return null;
    const content = this.taskTemplate({
      heading: notification.title,
      intro: notification.message,
      task,
    });
    return this.recordAndSend({
      taskId: task.id,
      workspaceId: notification.workspaceId,
      senderId: notification.actorId || notification.userId,
      to: [user.email],
      subject: notification.title,
      body: content.text,
      html: content.html,
      kind: 'notification',
      notificationType: notification.type,
    });
  }

  async sendTaskEmail(input: {
    taskId: string;
    workspaceId: string;
    senderId: string;
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
    kind?: string;
    notificationType?: string;
  }) {
    const task = await this.taskFacts(input.taskId);
    const content = task
      ? this.taskTemplate({ heading: input.subject, intro: input.body, task })
      : { html: `<p>${this.escape(input.body)}</p>`, text: input.body };
    return this.recordAndSend({
      ...input,
      body: input.body,
      html: content.html,
      subject: input.subject,
      kind: input.kind || 'manual',
    });
  }

  async retry(emailId: string) {
    const row = await this.prisma.taskEmail.findUnique({ where: { id: emailId } });
    if (!row) return null;
    const result = await this.sendEmail({
      to: [row.recipientEmail],
      cc: row.cc ? row.cc.split(',').filter(Boolean) : [],
      subject: row.subject,
      html: this.escape(row.body).replace(/\n/g, '<br>'),
      text: row.body,
    });
    return this.present(await this.prisma.taskEmail.update({
      where: { id: row.id },
      data: result.ok
        ? { status: 'sent', messageId: result.messageId, error: null, sentAt: new Date() }
        : { status: 'failed', error: result.error },
    }));
  }

  async maybeSendDailySummary(
    userId: string,
    workspaceId: string,
    facts: {
      overdue: { id: string; title: string; dueDate: string | null; priority: string | null }[];
      dueToday: { id: string; title: string; priority: string | null }[];
      dueTomorrow: { id: string; title: string }[];
      mentions: { title: string; message: string }[];
    },
  ) {
    const [user, prefs] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, name: true } }),
      this.prisma.notificationPreference.findUnique({ where: { userId } }),
    ]);
    if (!prefs?.emailDailySummary || !user?.emailVerified || !user.email) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const existing = await this.prisma.taskEmail.findFirst({
      where: { senderId: userId, workspaceId, kind: 'daily_summary', status: 'sent', createdAt: { gte: start } },
    });
    if (existing) return existing;
    const high = [...facts.overdue, ...facts.dueToday].filter((task) => /high|urgent/i.test(task.priority || ''));
    const lines = [
      'Overdue tasks',
      ...(facts.overdue.length ? facts.overdue.map((task) => `- ${task.title}${task.priority ? ` (${task.priority})` : ''}`) : ['- None']),
      '',
      'Tasks due today',
      ...(facts.dueToday.length ? facts.dueToday.map((task) => `- ${task.title}${task.priority ? ` (${task.priority})` : ''}`) : ['- None']),
      '',
      'Tasks due tomorrow',
      ...(facts.dueTomorrow.length ? facts.dueTomorrow.map((task) => `- ${task.title}`) : ['- None']),
      '',
      'High priority tasks',
      ...(high.length ? high.map((task) => `- ${task.title}`) : ['- None']),
      '',
      'Unread mentions',
      ...(facts.mentions.length ? facts.mentions.map((item) => `- ${item.message}`) : ['- None']),
    ];
    const text = lines.join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">${lines
      .map((line) => `<p style="margin:4px 0">${this.escape(line) || '&nbsp;'}</p>`)
      .join('')}</div>`;
    return this.recordAndSend({
      workspaceId,
      senderId: userId,
      to: [user.email],
      subject: 'Your tasks today',
      body: text,
      html,
      kind: 'daily_summary',
    });
  }

  verificationMessage(userId: string, email: string, name: string) {
    const token = this.jwt.sign({ sub: userId, email, purpose: 'verify-email' }, { expiresIn: '2d' });
    const apiBase = (process.env.APP_API_URL || 'http://localhost:4001').replace(/\/$/, '');
    const link = `${apiBase}/auth/email/verify?token=${encodeURIComponent(token)}`;
    return {
      to: [email],
      subject: 'Verify your email',
      text: `Hi ${name}, verify your email: ${link}`,
      html: `<p>Hi ${this.escape(name)},</p><p><a href="${link}">Verify your email</a></p>`,
    };
  }

  private async recordAndSend(input: {
    taskId?: string;
    workspaceId: string;
    senderId: string;
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
    html: string;
    kind: string;
    notificationType?: string;
  }) {
    const recipients = input.to.map((item) => item.trim()).filter(Boolean);
    const rows = [];
    for (const recipient of recipients) {
      rows.push(
        await this.prisma.taskEmail.create({
          data: {
            taskId: input.taskId || null,
            workspaceId: input.workspaceId,
            senderId: input.senderId,
            recipientEmail: recipient,
            cc: (input.cc || []).join(','),
            subject: input.subject,
            body: input.body,
            status: 'pending',
            kind: input.kind,
            notificationType: input.notificationType || null,
          },
        }),
      );
    }
    const result = await this.sendEmail({ to: recipients, cc: input.cc, subject: input.subject, html: input.html, text: input.body });
    const savedRows = [];
    for (const row of rows) {
      savedRows.push(
        await this.prisma.taskEmail.update({
          where: { id: row.id },
          data: result.ok
            ? { status: 'sent', messageId: result.messageId, sentAt: new Date(), error: null }
            : { status: 'failed', error: result.error },
        }),
      );
    }
    if (result.ok && input.taskId) {
      await this.prisma.activityLog.create({
        data: {
          workspaceId: input.workspaceId,
          taskId: input.taskId,
          userId: input.senderId,
          action: `Email sent to ${recipients.join(', ')}`,
          meta: { taskEmailId: savedRows[0]?.id, recipientEmail: recipients.join(', ') },
        },
      });
    }
    return this.present(savedRows.find((row) => row.status === 'failed') || savedRows[0]);
  }

  private present<T extends { status: string; messageId: string | null; error: string | null }>(row: T | undefined) {
    if (!row) return row;
    return { ...row, success: row.status === 'sent', message_id: row.messageId };
  }

  private async taskFacts(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { name: true } },
        list: { include: { space: { include: { statuses: true } } } },
      },
    });
    if (!task) return null;
    const status = task.list.space.statuses.find((item) => item.id === task.statusId);
    return {
      id: task.id,
      title: task.title,
      status: status?.name || 'Unknown',
      priority: task.priority || 'None',
      assignee: task.assignee?.name || task.assigneeName || 'Unassigned',
      due: task.dueDate ? task.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'None',
    };
  }

  private taskTemplate(input: { heading: string; intro: string; task: { id: string; title: string; status: string; priority: string; assignee: string; due: string } }) {
    const link = this.taskUrl(input.task.id);
    const text = [
      input.intro,
      '',
      `Task: ${input.task.title}`,
      `Status: ${input.task.status}`,
      `Priority: ${input.task.priority}`,
      `Assignee: ${input.task.assignee}`,
      `Due: ${input.task.due}`,
      '',
      `Open Task: ${link}`,
    ].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
      <p>${this.escape(input.heading)}</p>
      <p>${this.escape(input.intro)}</p>
      <p><strong>Task:</strong> ${this.escape(input.task.title)}<br>
      <strong>Status:</strong> ${this.escape(input.task.status)}<br>
      <strong>Priority:</strong> ${this.escape(input.task.priority)}<br>
      <strong>Assignee:</strong> ${this.escape(input.task.assignee)}<br>
      <strong>Due:</strong> ${this.escape(input.task.due)}</p>
      <p><a href="${link}">Open Task</a></p>
    </div>`;
    return { text, html };
  }

  private escape(value: string) {
    return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
  }
}
