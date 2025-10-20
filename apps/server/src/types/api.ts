import { UserRole, type IUser, type IUserRecord } from '../auth/types';

/**
 * API响应基础格式
 */
export interface IApiResponse<T = any> {
  /** 返回码，0表示成功，负数表示错误 */
  code: number;
  /** 响应消息 */
  message: string;
  /** 响应数据 */
  result: T;
}

/**
 * 用户角色 - 导出供外部使用
 */
export { UserRole };

/**
 * 用户信息接口 - 从 auth/types 重新导出
 */
export type { IUser, IUserRecord };

/**
 * 用户注册请求参数
 */
export interface IRegisterParams {
  username: string;
  name?: string; // 用户显示名称（可选，默认使用username）
  email: string;
  password: string;
  role?: UserRole;
}

/**
 * 用户登录请求参数
 */
export interface ILoginParams {
  username: string;
  password: string;
}

/**
 * 登录响应数据
 */
export interface ILoginResult {
  token: string;
  user: IUser;
  expiresIn: number;
}

/**
 * Token刷新请求参数
 */
export interface IRefreshTokenParams {
  token: string;
}

/**
 * Token刷新响应数据
 */
export interface IRefreshTokenResult {
  token: string;
  expiresIn: number;
}
