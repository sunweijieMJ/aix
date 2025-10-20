import Router from '@koa/router';
import { API_PREFIX } from '../constants';
import authRouter from './auth';
import configRouter from './localConfig';
import logsRouter from './logs';
import versionRouter from './version';

const router = new Router({ prefix: API_PREFIX });

/**
 * 注册子路由到主路由
 * @param mainRouter 主路由
 * @param subRouters 子路由数组
 * @param customPrefix 自定义前缀
 */
function registerRouters(mainRouter: Router, subRouters: Router[], customPrefix?: string): void {
  for (const subRouter of subRouters) {
    const prefix = customPrefix ? `${customPrefix}${subRouter.opts.prefix}` : '';
    const routerToUse = prefix ? new Router({ prefix }) : subRouter;

    if (prefix) {
      // 如果有自定义前缀，需要将子路由的所有路由复制到新的路由实例
      for (const layer of subRouter.stack) {
        routerToUse.register(layer.path, layer.methods, layer.stack, { name: layer.name });
      }
    }

    mainRouter.use(routerToUse.routes());
    mainRouter.use(routerToUse.allowedMethods());
  }
}

// 服务器版本路由
registerRouters(router, [versionRouter]);

// 认证路由
registerRouters(router, [authRouter]);

// 日志查询路由（需要管理员权限）
registerRouters(router, [logsRouter]);

// 其他业务路由
registerRouters(router, [configRouter]);

export default router;
