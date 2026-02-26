import { z } from 'zod';
import { BaogeSkill } from '../types';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { loadPluginConfig } from '../../config';

interface EmailConfig {
  user: string;
  pass: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}

export const sendEmail: BaogeSkill = {
  metadata: {
    id: 'send_email',
    name: '发送邮件',
    version: '1.2.0',
    description: '通过 SMTP 发送电子邮件。',
    category: 'productivity',
    icon: 'Mail'
  },
  parameters: z.object({
    to: z.string().describe('收件人'),
    subject: z.string().describe('主题'),
    text: z.string().describe('内容')
  }),
  execute: async (params: { to: string; subject: string; text: string }) => {
    const config = loadPluginConfig<EmailConfig>('email');
    if (!config) return '错误: 缺少 email.json 配置';
    const transporter = nodemailer.createTransport({
      host: config.smtpHost, port: config.smtpPort, secure: true,
      auth: { user: config.user, pass: config.pass }
    });
    try {
      const info = await transporter.sendMail({
        from: `"豹哥" <${config.user}>`, to: params.to, subject: params.subject, text: params.text
      });
      return `已发送！ID: ${info.messageId}`;
    } catch (e: any) { return `错误: ${e.message}`; }
  }
};

export const listEmails: BaogeSkill = {
  metadata: {
    id: 'list_emails',
    name: '收件箱',
    version: '1.2.0',
    description: '查询最近邮件列表。',
    category: 'productivity',
    icon: 'Inbox'
  },
  parameters: z.object({ count: z.number().default(5) }),
  execute: async (params: { count: number }) => {
    const config = loadPluginConfig<EmailConfig>('email');
    if (!config) return '错误: 缺少 email.json 配置';
    const client = new ImapFlow({
      host: config.imapHost, port: config.imapPort, secure: true,
      auth: { user: config.user, pass: config.pass }, logger: false
    });
    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      const results: any[] = [];
      try {
        const messages = await client.fetch(`${client.mailbox.exists - params.count + 1}:*`, { envelope: true });
        for await (let msg of messages) {
          results.push({ id: msg.uid, subject: msg.envelope.subject });
        }
      } finally { lock.release(); }
      await client.logout();
      return results.length > 0 ? results.reverse().map(r => `[${r.id}] ${r.subject}`).join('
') : '空。';
    } catch (e: any) { return `错误: ${e.message}`; }
  }
};
