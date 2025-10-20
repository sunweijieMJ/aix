/**
 * 认证和权限管理类型定义
 */

/**
 * 用户角色
 */
export enum UserRole {
  ADMIN = 'admin', // 管理员 - 完全访问权限
  USER = 'user', // 普通用户 - 基本访问权限
  GUEST = 'guest', // 访客 - 只读权限
}

/**
 * 权限枚举
 */
export enum Permission {
  // 配置管理权限
  CONFIG_READ = 'config:read',
  CONFIG_WRITE = 'config:write',
  CONFIG_DELETE = 'config:delete',

  // 系统管理权限
  SYSTEM_MANAGE = 'system:manage',
  SYSTEM_MONITOR = 'system:monitor',

  // 用户管理权限
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',
}

/**
 * 角色权限映射
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    Permission.CONFIG_READ,
    Permission.CONFIG_WRITE,
    Permission.CONFIG_DELETE,
    Permission.SYSTEM_MANAGE,
    Permission.SYSTEM_MONITOR,
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.USER_DELETE,
  ],
  [UserRole.USER]: [Permission.CONFIG_READ, Permission.CONFIG_WRITE, Permission.SYSTEM_MONITOR, Permission.USER_READ],
  [UserRole.GUEST]: [Permission.CONFIG_READ, Permission.SYSTEM_MONITOR],
};

/**
 * 用户接口
 */
export interface IUser {
  id: number;
  username: string;
  name?: string; // 用户显示名称
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

/**
 * 用户数据库记录（包含密码）
 */
export interface IUserRecord extends IUser {
  passwordHash: string;
}

/**
 * JWT Payload
 */
export interface IJWTPayload {
  userId: number;
  username: string;
  role: UserRole;
  iat?: number; // Issued at
  exp?: number; // Expiration
}

/**
 * 登录请求
 */
export interface ILoginRequest {
  username: string;
  password: string;
}

/**
 * 登录响应
 */
export interface ILoginResponse {
  token: string;
  user: IUser;
  expiresIn: number;
}

/**
 * 注册请求
 */
export interface IRegisterRequest {
  username: string;
  name?: string; // 用户显示名称（可选，默认使用username）
  email: string;
  password: string;
  role?: UserRole;
}

/**
 * Token验证结果
 */
export interface ITokenVerifyResult {
  valid: boolean;
  payload?: IJWTPayload;
  error?: string;
}
