/**
 * 认证路由
 */
import Router from '@koa/router';
import { Context } from 'koa';
import { AuthService } from '../auth/service';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware';
import { tokenBlacklist } from '../auth/blacklist';
import { createLogger } from '../utils/logger';
import { AppError, ErrorCode } from '../utils/errors';
import { IRegisterParams, ILoginParams, IRefreshTokenParams } from '../types/api';
import { validate } from '../middleware/zodValidator';
import { registerSchema, loginSchema, refreshTokenSchema } from '../auth/schemas';

const router = new Router({ prefix: '/auth' });
const logger = createLogger('AUTH_ROUTES');

// 创建认证服务实例
const authService = new AuthService();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: 用户注册
 *     description: 注册新用户账号
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *                 description: 用户名（3-50个字符）
 *                 example: johndoe
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: 用户显示名称（可选，默认使用username）
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 电子邮箱
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 format: password
 *                 description: 密码（至少8个字符，需包含大小写字母和数字）
 *                 example: StrongPass123!
 *               role:
 *                 type: string
 *                 enum: [admin, user, guest]
 *                 description: 用户角色（可选，默认为user）
 *                 example: user
 *     responses:
 *       200:
 *         description: 注册成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: User registered successfully
 *                 result:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     username:
 *                       type: string
 *                       example: johndoe
 *                     name:
 *                       type: string
 *                       example: John Doe
 *                     email:
 *                       type: string
 *                       example: johndoe@example.com
 *                     role:
 *                       type: string
 *                       example: user
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2024-01-01T00:00:00.000Z
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2024-01-01T00:00:00.000Z
 *       400:
 *         description: 请求参数错误（密码太弱、用户名已存在等）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: -2
 *                 message:
 *                   type: string
 *                   example: Username already exists
 *       500:
 *         description: 服务器内部错误
 */
router.post('/register', validate(registerSchema), async (ctx: Context) => {
  try {
    const { username, name, email, password, role } = ctx.request.body as IRegisterParams;

    // 注册用户
    const user = await authService.register({
      username,
      name,
      email,
      password,
      role,
    });

    ctx.body = {
      code: 0,
      message: 'User registered successfully',
      result: user,
    };

    logger.info(`User registered: ${username}`);
  } catch (error) {
    logger.error('Registration failed:', error);
    throw error;
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: 用户登录
 *     description: 使用用户名和密码登录，获取访问令牌
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: 用户名
 *                 example: admin
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 密码
 *                 example: admin123
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 result:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: JWT访问令牌
 *                       example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         username:
 *                           type: string
 *                           example: admin
 *                         email:
 *                           type: string
 *                           example: admin@example.com
 *                         role:
 *                           type: string
 *                           example: admin
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     expiresIn:
 *                       type: integer
 *                       description: 令牌过期时间（秒）
 *                       example: 86400
 *       401:
 *         description: 用户名或密码错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: -4
 *                 message:
 *                   type: string
 *                   example: Invalid username or password
 *       400:
 *         description: 请求参数缺失
 *       500:
 *         description: 服务器内部错误
 */
router.post('/login', validate(loginSchema), async (ctx: Context) => {
  try {
    const { username, password } = ctx.request.body as ILoginParams;

    // 用户登录
    const loginResult = await authService.login({ username, password });

    ctx.body = {
      code: 0,
      message: 'Login successful',
      result: loginResult,
    };

    logger.info(`User logged in: ${username}`);
  } catch (error) {
    logger.error('Login failed:', error);
    throw error;
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: 刷新访问令牌
 *     description: 使用现有令牌刷新获取新的访问令牌
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: 当前的JWT令牌
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: 令牌刷新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: Token refreshed successfully
 *                 result:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: 新的JWT访问令牌
 *                       example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                     expiresIn:
 *                       type: integer
 *                       description: 令牌过期时间（秒）
 *                       example: 86400
 *       400:
 *         description: 令牌缺失
 *       401:
 *         description: 令牌无效或已过期
 *       500:
 *         description: 服务器内部错误
 */
router.post('/refresh', validate(refreshTokenSchema), async (ctx: Context) => {
  try {
    const { token } = ctx.request.body as IRefreshTokenParams;

    // 刷新 token
    const result = await authService.refreshToken(token);

    ctx.body = {
      code: 0,
      message: 'Token refreshed successfully',
      result,
    };

    logger.debug('Token refreshed');
  } catch (error) {
    logger.error('Token refresh failed:', error);
    throw error;
  }
});

/**
 * @swagger
 * /auth/userinfo:
 *   get:
 *     summary: 获取当前用户信息
 *     description: 获取当前已认证用户的详细信息
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取用户信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: User info retrieved successfully
 *                 result:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     username:
 *                       type: string
 *                       example: johndoe
 *                     name:
 *                       type: string
 *                       example: John Doe
 *                     email:
 *                       type: string
 *                       example: johndoe@example.com
 *                     role:
 *                       type: string
 *                       example: user
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: 未认证或令牌无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: -4
 *                 message:
 *                   type: string
 *                   example: No token provided
 *       404:
 *         description: 用户不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get('/userinfo', authMiddleware, async (ctx: Context) => {
  try {
    const userId = ctx.state.userId;

    if (!userId) {
      throw new AppError('User ID not found in token', ErrorCode.UNAUTHORIZED, 401);
    }

    // 获取用户信息
    const user = await authService.getUserInfo(userId);

    ctx.body = {
      code: 0,
      message: 'User info retrieved successfully',
      result: user,
    };
  } catch (error) {
    logger.error('Failed to get user info:', error);
    throw error;
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 用户登出
 *     description: 登出当前用户（客户端应删除存储的令牌）
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 登出成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: Logout successful
 *                 result:
 *                   type: object
 *                   nullable: true
 *                   example: null
 *       401:
 *         description: 未认证或令牌无效
 *       500:
 *         description: 服务器内部错误
 */
router.post('/logout', authMiddleware, async (ctx: Context) => {
  try {
    const username = ctx.state.user?.username;

    // 从请求头获取token
    const authHeader = ctx.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // 将token添加到黑名单
      await tokenBlacklist.addToBlacklist(token);
      logger.info(`Token blacklisted for user: ${username}`);
    }

    ctx.body = {
      code: 0,
      message: 'Logout successful',
      result: null,
    };

    logger.info(`User logged out: ${username}`);
  } catch (error) {
    logger.error('Logout failed:', error);
    throw error;
  }
});

/**
 * @swagger
 * /auth/validate:
 *   get:
 *     summary: 验证令牌有效性
 *     description: 检查提供的令牌是否有效（可选认证，不强制要求令牌）
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         required: false
 *         description: Bearer token (可选)
 *         example: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: 验证结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: Token is valid
 *                 result:
 *                   type: object
 *                   properties:
 *                     valid:
 *                       type: boolean
 *                       description: 令牌是否有效
 *                       example: true
 *                     user:
 *                       type: object
 *                       nullable: true
 *                       description: 用户信息（如果令牌有效）
 *                       properties:
 *                         userId:
 *                           type: integer
 *                           example: 1
 *                         username:
 *                           type: string
 *                           example: johndoe
 *                         role:
 *                           type: string
 *                           example: user
 *       500:
 *         description: 服务器内部错误
 */
router.get('/validate', optionalAuthMiddleware, async (ctx: Context) => {
  try {
    const isAuthenticated = !!ctx.state.user;

    ctx.body = {
      code: 0,
      message: isAuthenticated ? 'Token is valid' : 'Token is invalid or missing',
      result: {
        valid: isAuthenticated,
        user: isAuthenticated ? ctx.state.user : null,
      },
    };
  } catch (error) {
    logger.error('Token validation failed:', error);
    throw error;
  }
});

export default router;
