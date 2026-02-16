/**
 * Vitest 设置文件
 * 在测试运行前加载测试环境变量
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

// 加载 .env.test 文件
config({ path: resolve(import.meta.dirname, '.env.test') });
