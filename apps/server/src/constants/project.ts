/**
 * 项目常量配置
 * 集中管理项目相关的名称、标识等信息
 */

export const PROJECT = {
  // 项目名称
  NAME: 'Base Node Server',
  NAME_EN: 'base-node-server',

  // 数据库名称前缀
  DB_PREFIX: 'base_node',

  // 团队信息
  TEAM: {
    NAME: 'Node Team',
    EMAIL: 'support@example.com',
  },

  // API 相关
  API: {
    TITLE: 'Base Node Server API',
    DESCRIPTION: '配置管理服务 API 文档',
  },

  // 文档链接
  DOCS: {
    PORT: 3001,
    PREFIX: '/local/v1',
  },
} as const;

// 辅助函数：生成数据库名称
export function getDbName(env: 'dev' | 'test' | 'prod' = 'dev'): string {
  return `${PROJECT.DB_PREFIX}_${env}`;
}
