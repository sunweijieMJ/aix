import fs from 'fs';
import path from 'path';
import Router from '@koa/router';
import { createLogger } from '../utils/logger';
import { createRouteHandler } from '../utils/routeHandler';

const logger = createLogger('VERSION_ROUTES');

/**
 * 版本信息路由
 * 访问路径: /local/v1/version
 */
const router = new Router({ prefix: '/version' });

// 版本信息接口
interface BuildInfo {
  server_docker_md5: string;
  server_docker_name: string;
  build_at: string;
  git_hash: string;
  git_branch: string;
}

// 读取版本信息
const getBuildInfo = (): BuildInfo => {
  try {
    const buildInfoPath = path.join(process.cwd(), 'server_build_info.sh');
    if (!fs.existsSync(buildInfoPath)) {
      return {
        server_docker_md5: 'unknown',
        server_docker_name: 'unknown',
        build_at: 'unknown',
        git_hash: 'unknown',
        git_branch: 'unknown',
      };
    }

    const content = fs.readFileSync(buildInfoPath, 'utf-8');
    const info: Record<string, string> = {};

    content.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        info[key] = value;
      }
    });

    return {
      server_docker_md5: info.server_docker_md5 || 'unknown',
      server_docker_name: info.server_docker_name || 'unknown',
      build_at: info.build_at || 'unknown',
      git_hash: info.git_hash || 'unknown',
      git_branch: info.git_branch || 'unknown',
    };
  } catch (error) {
    logger.error('Error reading build info:', error);
    return {
      server_docker_md5: 'error',
      server_docker_name: 'error',
      build_at: 'error',
      git_hash: 'error',
      git_branch: 'error',
    };
  }
};

/**
 * GET /local/v1/version
 * 返回服务器版本信息
 */
router.get(
  '/',
  createRouteHandler(
    async () => {
      return getBuildInfo();
    },
    { operation: 'get server version', successMessage: 'Get server version successfully' },
  ),
);

export default router;
