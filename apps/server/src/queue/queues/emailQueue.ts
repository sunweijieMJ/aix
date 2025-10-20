/**
 * 邮件队列示例
 * 演示如何使用队列管理器处理异步任务
 */
import { getQueueManager } from '../queueManager';
import { createLogger } from '../../utils/logger';

const logger = createLogger('EMAIL_QUEUE');

/**
 * 邮件任务数据
 */
export interface IEmailJobData {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

/**
 * 初始化邮件队列
 */
export function initEmailQueue() {
  const queueManager = getQueueManager();

  // 创建邮件队列
  const emailQueue = queueManager.createQueue<IEmailJobData>('email', {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 100, // 保留最近100个已完成的任务
      removeOnFail: 500, // 保留最近500个失败的任务
    },
  });

  // 注册邮件处理器
  queueManager.registerProcessor<IEmailJobData, void>(
    'email',
    async job => {
      const { to, subject, from } = job.data;

      logger.info(`Sending email to ${to}`, {
        subject,
        from: from || 'noreply@example.com',
      });

      // 模拟发送邮件
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 这里可以集成真实的邮件发送服务
      // 如 SendGrid, AWS SES, Nodemailer 等
      // await sendEmailService.send({ to, subject, body, from });

      logger.info(`Email sent successfully to ${to}`);
    },
    {
      concurrency: 5, // 并发处理5个邮件任务
    },
  );

  logger.info('Email queue initialized');
  return emailQueue;
}

/**
 * 发送邮件任务
 */
export async function sendEmail(emailData: IEmailJobData) {
  const queueManager = getQueueManager();
  return await queueManager.addJob('email', 'send-email', emailData, {
    priority: 1,
  });
}

/**
 * 发送批量邮件任务
 */
export async function sendBulkEmails(emails: IEmailJobData[]) {
  const queueManager = getQueueManager();
  const jobs = [];

  for (const emailData of emails) {
    jobs.push(
      queueManager.addJob('email', 'send-email', emailData, {
        priority: 2, // 批量邮件优先级较低
      }),
    );
  }

  return await Promise.all(jobs);
}
