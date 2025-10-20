/**
 * 日志查询路由
 */
import Router from '@koa/router';
import { Context } from 'koa';
import { logAggregator } from '../utils/logAggregator';
import { createLogger } from '../utils/logger';
import { requireAdmin } from '../auth/middleware';

const router = new Router({ prefix: '/logs' });
const logger = createLogger('LOGS_ROUTES');

/**
 * GET /logs/query
 * 查询日志
 */
router.get('/query', requireAdmin, async (ctx: Context) => {
  try {
    const { level, context, requestId, startTime, endTime, limit, offset } = ctx.query;

    const result = await logAggregator.queryLogs({
      level: level as string | undefined,
      context: context as string | undefined,
      requestId: requestId as string | undefined,
      startTime: startTime as string | undefined,
      endTime: endTime as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    ctx.body = {
      code: 0,
      message: 'Logs retrieved successfully',
      result,
    };
  } catch (error) {
    logger.error('Failed to query logs:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to query logs',
      result: null,
    };
  }
});

/**
 * GET /logs/statistics
 * 获取日志统计信息
 */
router.get('/statistics', requireAdmin, async (ctx: Context) => {
  try {
    const stats = logAggregator.getStatistics();

    ctx.body = {
      code: 0,
      message: 'Log statistics retrieved successfully',
      result: stats,
    };
  } catch (error) {
    logger.error('Failed to get log statistics:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to get log statistics',
      result: null,
    };
  }
});

/**
 * GET /logs/errors/analysis
 * 分析错误日志
 */
router.get('/errors/analysis', requireAdmin, async (ctx: Context) => {
  try {
    const analysis = await logAggregator.analyzeErrors();

    ctx.body = {
      code: 0,
      message: 'Error analysis retrieved successfully',
      result: analysis,
    };
  } catch (error) {
    logger.error('Failed to analyze errors:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to analyze errors',
      result: null,
    };
  }
});

/**
 * GET /logs/trace/:requestId
 * 获取请求追踪链
 */
router.get('/trace/:requestId', requireAdmin, async (ctx: Context) => {
  try {
    const { requestId } = ctx.params;
    const trace = logAggregator.getRequestTrace(requestId);

    ctx.body = {
      code: 0,
      message: 'Request trace retrieved successfully',
      result: {
        requestId,
        logs: trace,
        count: trace.length,
      },
    };
  } catch (error) {
    logger.error('Failed to get request trace:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to get request trace',
      result: null,
    };
  }
});

/**
 * GET /logs/files
 * 列出可用的日志文件
 */
router.get('/files', requireAdmin, async (ctx: Context) => {
  try {
    const files = await logAggregator.listLogFiles();

    ctx.body = {
      code: 0,
      message: 'Log files listed successfully',
      result: {
        files,
        count: files.length,
      },
    };
  } catch (error) {
    logger.error('Failed to list log files:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to list log files',
      result: null,
    };
  }
});

/**
 * GET /logs/files/:filename
 * 读取日志文件
 */
router.get('/files/:filename', requireAdmin, async (ctx: Context) => {
  try {
    const { filename } = ctx.params;
    const { tail, level } = ctx.query;

    const logs = await logAggregator.readLogFile(filename, {
      tail: tail ? parseInt(tail as string) : undefined,
      level: level as string | undefined,
    });

    ctx.body = {
      code: 0,
      message: 'Log file content retrieved successfully',
      result: {
        filename,
        logs,
        count: logs.length,
      },
    };
  } catch (error) {
    logger.error('Failed to read log file:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to read log file',
      result: null,
    };
  }
});

/**
 * DELETE /logs/clear
 * 清除内存中的日志
 */
router.delete('/clear', requireAdmin, async (ctx: Context) => {
  try {
    logAggregator.clearLogs();

    ctx.body = {
      code: 0,
      message: 'Memory logs cleared successfully',
      result: null,
    };

    logger.info('Memory logs cleared by admin');
  } catch (error) {
    logger.error('Failed to clear logs:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to clear logs',
      result: null,
    };
  }
});

export default router;
