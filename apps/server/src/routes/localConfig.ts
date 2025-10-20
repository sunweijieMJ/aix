import Router from '@koa/router';
import { validate } from '../middleware/zodValidator';
import { IConfigService } from '../services/localConfigService';
import { IUpdateLocalConfigParams } from '../types';
import { container } from '../utils/container';
import { createRouteHandler, extractBody } from '../utils/routeHandler';
import { configPathParamsSchema, updateConfigSchema, batchDeleteConfigSchema } from './schemas/config.schemas';

const router = new Router({ prefix: '/config' });

// 获取配置服务实例
const getConfigService = (): IConfigService => {
  return container.get<IConfigService>('ConfigService');
};

/**
 * @swagger
 * /config:
 *   get:
 *     summary: 获取所有配置
 *     description: 返回所有配置项列表
 *     tags: [Config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取所有配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get(
  '/',
  createRouteHandler(
    async () => {
      const configService = getConfigService();
      return await configService.getAll();
    },
    { operation: 'get all configurations', successMessage: 'Get all configurations successfully' },
  ),
);

/**
 * @swagger
 * /config/{path}:
 *   get:
 *     summary: 根据路径获取配置
 *     description: 根据指定路径获取配置项
 *     tags: [Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 配置路径（点分割）
 *         example: app.setting.theme
 *     responses:
 *       200:
 *         description: 成功获取配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: 配置不存在
 */
router.get(
  '/:path',
  validate({ params: configPathParamsSchema }),
  createRouteHandler(
    async ctx => {
      const { path } = ctx.params;

      const configService = getConfigService();
      const config = await configService.getByPath(path);

      if (!config) {
        throw new Error(`Configuration not found for path: ${path}`);
      }

      return config;
    },
    { operation: 'get configuration', successMessage: 'Get configuration successfully' },
  ),
);

/**
 * @swagger
 * /config/{path}:
 *   put:
 *     summary: 创建或更新配置
 *     description: 根据路径创建新配置或更新已存在的配置
 *     tags: [Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 配置路径
 *         example: app.setting.theme
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - value
 *             properties:
 *               value:
 *                 type: object
 *                 description: 配置值（JSON对象）
 *                 example: { "color": "blue", "mode": "dark" }
 *     responses:
 *       200:
 *         description: 配置保存成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.put(
  '/:path',
  validate({ params: configPathParamsSchema, body: updateConfigSchema }),
  createRouteHandler(
    async ctx => {
      const { path } = ctx.params;
      const { value } = ctx.request.body as IUpdateLocalConfigParams;

      const configService = getConfigService();
      return await configService.upsert(path, value);
    },
    { operation: 'save configuration', successMessage: 'Configuration saved successfully' },
  ),
);

/**
 * 删除配置
 * DELETE /config/{path}
 */
router.delete(
  '/:path',
  validate({ params: configPathParamsSchema }),
  createRouteHandler(
    async ctx => {
      const { path } = ctx.params;

      const configService = getConfigService();
      const deleted = await configService.delete(path);

      if (!deleted) {
        throw new Error(`Configuration not found for path: ${path}`);
      }

      return null;
    },
    { operation: 'delete configuration', successMessage: 'Configuration deleted successfully' },
  ),
);

/**
 * 批量操作接口
 */

/**
 * 批量删除配置
 * DELETE /config
 */
router.delete(
  '/',
  validate({ body: batchDeleteConfigSchema }),
  createRouteHandler(
    async ctx => {
      const { paths } = extractBody<{ paths: string[] }>(ctx, ['paths']);

      const configService = getConfigService();
      const deletedCount = await configService.deleteBatch(paths);
      return { deletedCount };
    },
    { operation: 'batch delete configurations', successMessage: 'Configurations deleted successfully' },
  ),
);

/**
 * 清空所有配置
 * DELETE /config/clear/all
 */
router.delete(
  '/clear/all',
  createRouteHandler(
    async () => {
      const configService = getConfigService();
      const deletedCount = await configService.clear();
      return { deletedCount };
    },
    { operation: 'clear all configurations', successMessage: 'All configurations cleared successfully' },
  ),
);

export default router;
