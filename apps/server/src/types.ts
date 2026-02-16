/**
 * 类型定义
 */

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: 'admin' | 'user'; // 与 User.role 保持一致
}
