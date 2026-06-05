import { resolve } from 'node:path';

/**
 * 存储根目录（SQLite 数据库、上传文件等本地持久化的统一锚点）
 *
 * 默认相对启动目录（生产以 apps/server 为 cwd 运行）；
 * 测试/部署可通过 AIX_STORAGE_DIR 显式指定，
 * 避免从仓库根运行测试时在根目录产生 storage/ 污染。
 */
export const STORAGE_ROOT = process.env.AIX_STORAGE_DIR
  ? resolve(process.env.AIX_STORAGE_DIR)
  : resolve(process.cwd(), 'storage');
