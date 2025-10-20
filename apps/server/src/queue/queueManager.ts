/**
 * 消息队列管理器
 * 基于 Bull + Redis 实现异步任务处理
 */
import { Queue, Job, QueueOptions, Worker, WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '../utils/logger';

const logger = createLogger('QUEUE_MANAGER');

/**
 * 队列配置
 */
export interface IQueueConfig {
  /** Redis 连接配置 */
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  /** 队列默认选项 */
  defaultJobOptions?: {
    /** 任务失败后的重试次数 */
    attempts?: number;
    /** 重试间隔（毫秒） */
    backoff?: number | { type: 'exponential' | 'fixed'; delay: number };
    /** 任务超时时间（毫秒） */
    timeout?: number;
    /** 任务完成后保留时间（毫秒） */
    removeOnComplete?: boolean | number;
    /** 任务失败后保留时间（毫秒） */
    removeOnFail?: boolean | number;
  };
}

/**
 * 任务处理器函数类型
 */
export type JobProcessor<T = any, R = any> = (job: Job<T>) => Promise<R>;

/**
 * 队列管理器
 */
export class QueueManager {
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private connection: Redis;
  private config: IQueueConfig;

  constructor(config: IQueueConfig) {
    this.config = config;

    // 创建 Redis 连接
    this.connection = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
      maxRetriesPerRequest: null, // Bull 要求设置为 null
    });

    this.connection.on('connect', () => {
      logger.info('Queue manager connected to Redis', {
        host: config.redis.host,
        port: config.redis.port,
      });
    });

    this.connection.on('error', error => {
      logger.error('Queue manager Redis connection error', error);
    });
  }

  /**
   * 创建队列
   */
  createQueue<T = any>(name: string, options?: Omit<QueueOptions, 'connection'>): Queue<T> {
    if (this.queues.has(name)) {
      logger.warn(`Queue ${name} already exists, returning existing queue`);
      return this.queues.get(name) as Queue<T>;
    }

    const queue = new Queue<T>(name, {
      connection: this.connection,
      defaultJobOptions: this.config.defaultJobOptions,
      ...options,
    });

    this.queues.set(name, queue);
    logger.info(`Queue created: ${name}`);

    return queue;
  }

  /**
   * 注册任务处理器
   */
  registerProcessor<T = any, R = any>(
    queueName: string,
    processor: JobProcessor<T, R>,
    options?: Omit<WorkerOptions, 'connection'>,
  ): Worker<T, R> {
    if (this.workers.has(queueName)) {
      logger.warn(`Worker for queue ${queueName} already exists`);
      return this.workers.get(queueName) as Worker<T, R>;
    }

    const worker = new Worker<T, R>(
      queueName,
      async job => {
        logger.info(`Processing job ${job.id} from queue ${queueName}`, {
          jobId: job.id,
          data: job.data,
          attemptsMade: job.attemptsMade,
        });

        try {
          const result = await processor(job);
          logger.info(`Job ${job.id} completed successfully`, {
            jobId: job.id,
            result,
          });
          return result;
        } catch (error) {
          logger.error(`Job ${job.id} failed`, {
            jobId: job.id,
            error: error instanceof Error ? error.message : String(error),
            attemptsMade: job.attemptsMade,
          });
          throw error;
        }
      },
      {
        connection: this.connection,
        ...options,
      },
    );

    // 监听 Worker 事件
    worker.on('completed', job => {
      logger.debug(`Worker completed job ${job.id}`, {
        jobId: job.id,
        returnValue: job.returnvalue,
      });
    });

    worker.on('failed', (job, error) => {
      logger.error(`Worker failed job ${job?.id}`, {
        jobId: job?.id,
        error: error.message,
        stack: error.stack,
      });
    });

    worker.on('error', error => {
      logger.error(`Worker error for queue ${queueName}`, error);
    });

    this.workers.set(queueName, worker);
    logger.info(`Worker registered for queue: ${queueName}`);

    return worker;
  }

  /**
   * 添加任务到队列
   */
  async addJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
      backoff?: number | { type: 'exponential' | 'fixed'; delay: number };
      removeOnComplete?: boolean | number;
      removeOnFail?: boolean | number;
    },
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found. Create it first using createQueue()`);
    }

    const job = await queue.add(jobName, data, options);
    logger.info(`Job added to queue ${queueName}`, {
      jobId: job.id,
      jobName,
      data,
    });

    return job;
  }

  /**
   * 获取队列
   */
  getQueue<T = any>(name: string): Queue<T> | undefined {
    return this.queues.get(name) as Queue<T> | undefined;
  }

  /**
   * 获取队列统计信息
   */
  async getQueueStats(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * 获取所有队列的统计信息
   */
  async getAllQueuesStats() {
    const stats = [];
    for (const queueName of this.queues.keys()) {
      stats.push(await this.getQueueStats(queueName));
    }
    return stats;
  }

  /**
   * 暂停队列
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    await queue.pause();
    logger.info(`Queue paused: ${queueName}`);
  }

  /**
   * 恢复队列
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    await queue.resume();
    logger.info(`Queue resumed: ${queueName}`);
  }

  /**
   * 清空队列
   */
  async cleanQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    await queue.drain();
    logger.info(`Queue cleaned: ${queueName}`);
  }

  /**
   * 关闭队列管理器
   */
  async close(): Promise<void> {
    // 关闭所有 workers
    for (const [name, worker] of this.workers.entries()) {
      await worker.close();
      logger.info(`Worker closed: ${name}`);
    }

    // 关闭所有队列
    for (const [name, queue] of this.queues.entries()) {
      await queue.close();
      logger.info(`Queue closed: ${name}`);
    }

    // 关闭 Redis 连接
    await this.connection.quit();
    logger.info('Queue manager closed');
  }
}

/**
 * 全局队列管理器实例
 */
let queueManagerInstance: QueueManager | null = null;

/**
 * 初始化队列管理器
 */
export function initQueueManager(config: IQueueConfig): QueueManager {
  if (queueManagerInstance) {
    logger.warn('Queue manager already initialized, returning existing instance');
    return queueManagerInstance;
  }

  queueManagerInstance = new QueueManager(config);
  return queueManagerInstance;
}

/**
 * 获取队列管理器实例
 */
export function getQueueManager(): QueueManager {
  if (!queueManagerInstance) {
    throw new Error('Queue manager not initialized. Call initQueueManager() first.');
  }
  return queueManagerInstance;
}

/**
 * 关闭队列管理器
 */
export async function closeQueueManager(): Promise<void> {
  if (queueManagerInstance) {
    await queueManagerInstance.close();
    queueManagerInstance = null;
  }
}

export default QueueManager;
