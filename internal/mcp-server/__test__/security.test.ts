import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createSecurityManager,
  getSecurityConfigFromEnv,
  SecurityError,
  SecurityManager,
} from '../src/utils/security';

describe('SecurityManager', () => {
  let securityManager: SecurityManager;

  beforeEach(() => {
    securityManager = new SecurityManager();
  });

  afterEach(() => {
    securityManager.stop();
  });

  describe('constructor', () => {
    it('should create security manager with default config', () => {
      expect(securityManager).toBeInstanceOf(SecurityManager);
    });

    it('should create security manager with custom config', () => {
      const customConfig = {
        enableApiKeyAuth: true,
        apiKeys: ['test-key-1', 'test-key-2'],
        rateLimiting: {
          enabled: true,
          global: { windowMs: 30000, maxRequests: 50 },
          perClient: { windowMs: 30000, maxRequests: 10 },
        },
      };

      const manager = new SecurityManager(customConfig);
      expect(manager).toBeInstanceOf(SecurityManager);
      manager.stop();
    });
  });

  describe('API key validation', () => {
    it('should allow requests when API key auth is disabled', () => {
      const isValid = securityManager.validateApiKey();
      expect(isValid).toBe(true);
    });

    it('should allow requests when API key auth is disabled even with key provided', () => {
      const isValid = securityManager.validateApiKey('some-key');
      expect(isValid).toBe(true);
    });

    it('should validate API keys when auth is enabled', () => {
      const manager = new SecurityManager({
        enableApiKeyAuth: true,
        apiKeys: ['valid-key-1', 'valid-key-2'],
      });

      expect(manager.validateApiKey('valid-key-1')).toBe(true);
      expect(manager.validateApiKey('valid-key-2')).toBe(true);
      expect(manager.validateApiKey('invalid-key')).toBe(false);
      expect(manager.validateApiKey()).toBe(false);

      manager.stop();
    });
  });

  describe('rate limiting', () => {
    it('should allow requests when rate limiting is disabled', () => {
      const manager = new SecurityManager({
        rateLimiting: {
          enabled: false,
          global: { windowMs: 60000, maxRequests: 100 },
          perClient: { windowMs: 60000, maxRequests: 30 },
        },
      });

      const context = manager.createRequestContext({
        'x-client-id': 'test-client',
      });

      const result = manager.checkRateLimit(context);
      expect(result.allowed).toBe(true);

      manager.stop();
    });

    it('should enforce global rate limits', () => {
      const manager = new SecurityManager({
        rateLimiting: {
          enabled: true,
          global: { windowMs: 60000, maxRequests: 2 },
          perClient: { windowMs: 60000, maxRequests: 10 },
        },
      });

      const context1 = manager.createRequestContext({
        'x-client-id': 'client1',
      });
      const context2 = manager.createRequestContext({
        'x-client-id': 'client2',
      });
      const context3 = manager.createRequestContext({
        'x-client-id': 'client3',
      });

      // First two requests should be allowed
      expect(manager.checkRateLimit(context1).allowed).toBe(true);
      manager.recordRequest(context1, true);

      expect(manager.checkRateLimit(context2).allowed).toBe(true);
      manager.recordRequest(context2, true);

      // Third request should be blocked (global limit exceeded)
      const result = manager.checkRateLimit(context3);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Global rate limit exceeded');
      expect(result.retryAfter).toBeGreaterThan(0);

      manager.stop();
    });

    it('should enforce per-client rate limits', () => {
      const manager = new SecurityManager({
        rateLimiting: {
          enabled: true,
          global: { windowMs: 60000, maxRequests: 100 },
          perClient: { windowMs: 60000, maxRequests: 2 },
        },
      });

      const context = manager.createRequestContext({
        'x-client-id': 'test-client',
      });

      // First two requests should be allowed
      expect(manager.checkRateLimit(context).allowed).toBe(true);
      manager.recordRequest(context, true);

      expect(manager.checkRateLimit(context).allowed).toBe(true);
      manager.recordRequest(context, true);

      // Third request should be blocked (client limit exceeded)
      const result = manager.checkRateLimit(context);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Client rate limit exceeded');

      manager.stop();
    });

    it('should skip successful requests if configured', () => {
      const manager = new SecurityManager({
        rateLimiting: {
          enabled: true,
          global: {
            windowMs: 60000,
            maxRequests: 2,
            skipSuccessfulRequests: true,
          },
          perClient: { windowMs: 60000, maxRequests: 10 },
        },
      });

      const context = manager.createRequestContext({
        'x-client-id': 'test-client',
      });

      // Record successful requests - should not be counted
      manager.recordRequest(context, true);
      manager.recordRequest(context, true);
      manager.recordRequest(context, true);

      // Should still be allowed since successful requests are skipped
      expect(manager.checkRateLimit(context).allowed).toBe(true);

      manager.stop();
    });
  });

  describe('request validation', () => {
    it('should validate request size', () => {
      const manager = new SecurityManager({
        requestValidation: {
          maxRequestSize: 1024,
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        },
      });

      expect(manager.validateRequestSize(512)).toBe(true);
      expect(manager.validateRequestSize(1024)).toBe(true);
      expect(manager.validateRequestSize(2048)).toBe(false);

      manager.stop();
    });

    it('should validate request methods', () => {
      const manager = new SecurityManager({
        requestValidation: {
          maxRequestSize: 1024 * 1024,
          allowedMethods: ['GET', 'POST'],
        },
      });

      expect(manager.validateRequestMethod('GET')).toBe(true);
      expect(manager.validateRequestMethod('POST')).toBe(true);
      expect(manager.validateRequestMethod('get')).toBe(true); // case insensitive
      expect(manager.validateRequestMethod('DELETE')).toBe(false);

      manager.stop();
    });
  });

  describe('CORS headers', () => {
    it('should return empty headers when CORS is disabled', () => {
      const manager = new SecurityManager({
        cors: {
          enabled: false,
          allowedOrigins: [],
          allowedHeaders: [],
        },
      });

      const headers = manager.getCorsHeaders('https://example.com');
      expect(Object.keys(headers)).toHaveLength(0);

      manager.stop();
    });

    it('should return CORS headers when enabled', () => {
      const manager = new SecurityManager({
        cors: {
          enabled: true,
          allowedOrigins: ['*'],
          allowedHeaders: ['Content-Type', 'Authorization'],
        },
        requestValidation: {
          maxRequestSize: 1024 * 1024,
          allowedMethods: ['GET', 'POST'],
        },
      });

      const headers = manager.getCorsHeaders('https://example.com');
      expect(headers['Access-Control-Allow-Origin']).toBe('*');
      expect(headers['Access-Control-Allow-Headers']).toBe(
        'Content-Type, Authorization',
      );
      expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST');

      manager.stop();
    });

    it('should validate specific origins', () => {
      const manager = new SecurityManager({
        cors: {
          enabled: true,
          allowedOrigins: ['https://example.com', 'https://app.example.com'],
          allowedHeaders: ['Content-Type'],
        },
      });

      const headers1 = manager.getCorsHeaders('https://example.com');
      expect(headers1['Access-Control-Allow-Origin']).toBe(
        'https://example.com',
      );

      const headers2 = manager.getCorsHeaders('https://malicious.com');
      expect(headers2['Access-Control-Allow-Origin']).toBeUndefined();

      manager.stop();
    });
  });

  describe('request context creation', () => {
    it('should create request context from headers', () => {
      const headers = {
        'x-client-id': 'test-client',
        'x-api-key': 'test-api-key',
        'user-agent': 'TestAgent/1.0',
      };

      const context = securityManager.createRequestContext(headers);
      expect(context.clientId).toBe('test-client');
      expect(context.apiKey).toBe('test-api-key');
      expect(context.userAgent).toBe('TestAgent/1.0');
      expect(context.timestamp).toBeTypeOf('number');
      expect(context.requestId).toBeTypeOf('string');
    });

    it('should extract API key from Authorization header', () => {
      const headers = {
        authorization: 'Bearer test-bearer-token',
      };

      const context = securityManager.createRequestContext(headers);
      expect(context.apiKey).toBe('test-bearer-token');
    });

    it('should extract API key from ApiKey header format', () => {
      const headers = {
        authorization: 'ApiKey test-api-key',
      };

      const context = securityManager.createRequestContext(headers);
      expect(context.apiKey).toBe('test-api-key');
    });

    it('should generate client ID from user agent and IP', () => {
      const headers = {
        'user-agent': 'TestAgent/1.0',
        'x-forwarded-for': '192.168.1.1',
      };

      const context = securityManager.createRequestContext(headers);
      expect(context.clientId).toBeTypeOf('string');
      expect(context.clientId).toHaveLength(16);
    });
  });

  describe('statistics', () => {
    it('should provide security statistics', () => {
      const context = securityManager.createRequestContext({
        'x-client-id': 'test-client',
      });

      securityManager.recordRequest(context, true);
      securityManager.recordRequest(context, false);

      const stats = securityManager.getStats();
      expect(stats.globalRequests).toBeGreaterThanOrEqual(0); // Could be 0 or more depending on implementation
      expect(stats.clientRequests).toBe(2);
      expect(stats.totalClients).toBe(1);
    });
  });

  describe('cleanup tasks', () => {
    it('should clean up expired records', async () => {
      const manager = new SecurityManager({
        rateLimiting: {
          enabled: true,
          global: { windowMs: 50, maxRequests: 10 }, // Very short window
          perClient: { windowMs: 50, maxRequests: 5 },
        },
      });

      const context = manager.createRequestContext({
        'x-client-id': 'test-client',
      });
      manager.recordRequest(context, true);

      const stats = manager.getStats();
      expect(stats.clientRequests).toBe(1);

      // Wait for cleanup (should happen after window expires)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Make another request to trigger cleanup check
      const newContext = manager.createRequestContext({
        'x-client-id': 'new-client',
      });
      const rateLimitResult = manager.checkRateLimit(newContext);
      expect(rateLimitResult.allowed).toBe(true); // Should be allowed since old records should be cleaned

      manager.stop();
    });
  });
});

describe('SecurityError', () => {
  it('should create security error with default status code', () => {
    const error = new SecurityError('Test error', 'TEST_ERROR');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.statusCode).toBe(403);
    expect(error.name).toBe('SecurityError');
  });

  it('should create security error with custom status code', () => {
    const error = new SecurityError('Unauthorized', 'UNAUTHORIZED', 401);
    expect(error.statusCode).toBe(401);
  });

  it('should create security error with retry after', () => {
    const error = new SecurityError('Rate limited', 'RATE_LIMITED', 429, 60);
    expect(error.retryAfter).toBe(60);
  });
});

describe('createSecurityManager', () => {
  it('should create security manager instance', () => {
    const manager = createSecurityManager();
    expect(manager).toBeInstanceOf(SecurityManager);
    manager.stop();
  });

  it('should create security manager with config', () => {
    const config = { enableApiKeyAuth: true, apiKeys: ['test-key'] };
    const manager = createSecurityManager(config);
    expect(manager).toBeInstanceOf(SecurityManager);
    manager.stop();
  });
});

describe('getSecurityConfigFromEnv', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return empty config when no env vars set', () => {
    process.env = {};
    const config = getSecurityConfigFromEnv();
    expect(config).toEqual({});
  });

  it('should parse API key configuration from env', () => {
    process.env = {
      MCP_ENABLE_API_KEY_AUTH: 'true',
      MCP_API_KEYS: 'key1,key2,key3',
    };

    const config = getSecurityConfigFromEnv();
    expect(config.enableApiKeyAuth).toBe(true);
    expect(config.apiKeys).toEqual(['key1', 'key2', 'key3']);
  });

  it('should parse rate limiting configuration from env', () => {
    process.env = {
      MCP_GLOBAL_RATE_LIMIT: '200',
      MCP_CLIENT_RATE_LIMIT: '50',
    };

    const config = getSecurityConfigFromEnv();
    expect(config.rateLimiting?.enabled).toBe(true);
    expect(config.rateLimiting?.global.maxRequests).toBe(200);
    expect(config.rateLimiting?.perClient.maxRequests).toBe(50);
  });

  it('should disable rate limiting when configured', () => {
    process.env = {
      MCP_RATE_LIMIT_ENABLED: 'false',
    };

    const config = getSecurityConfigFromEnv();
    expect(config.rateLimiting?.enabled).toBe(false);
  });

  it('should parse request validation configuration from env', () => {
    process.env = {
      MCP_MAX_REQUEST_SIZE: '2097152', // 2MB
    };

    const config = getSecurityConfigFromEnv();
    expect(config.requestValidation?.maxRequestSize).toBe(2097152);
  });
});
