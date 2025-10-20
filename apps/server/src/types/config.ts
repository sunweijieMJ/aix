/**
 * JSON配置项接口
 */
export interface ILocalConfig {
  /** 配置ID */
  id: number;
  /** 配置路径 */
  path: string;
  /** 配置值 */
  value: any;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 配置创建参数
 */
export interface ICreateLocalConfigParams {
  /** 配置路径 */
  path: string;
  /** 配置值 */
  value: any;
}

/**
 * 配置更新参数
 */
export interface IUpdateLocalConfigParams {
  /** 配置值 */
  value: any;
}
