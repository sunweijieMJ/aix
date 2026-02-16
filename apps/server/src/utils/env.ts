/**
 * 环境变量配置（使用 Zod 验证）
 */
import { config } from 'dotenv';
import { z } from 'zod';

config();

// 环境变量 Schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ALLOWED_ORIGINS: z.string().optional().default('http://localhost:5173,http://localhost:3000'),
});

// 验证环境变量
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  console.error('\n💡 Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

export const env = parsed.data;

// 生产环境额外检查
if (env.NODE_ENV === 'production') {
  const insecureSecrets = ['your-secret-key-change-in-production', 'secret', 'password', 'changeme'];

  if (insecureSecrets.includes(env.JWT_SECRET.toLowerCase())) {
    console.error('🚨 FATAL: Insecure JWT_SECRET detected in production!');
    console.error('Please set a strong, random JWT_SECRET in your .env file.');
    process.exit(1);
  }
}
