// src/__tests__/auth/token-manager.test.ts

// Mock fs module (must be mocked before importing token-manager)
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(''),
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

import { tokenManager } from '../../auth/token-manager';

describe('TokenManager', () => {
  beforeEach(() => {
    // Clear tokens to prevent interference between tests
    (tokenManager as any).userTokens = new Map();

    // Mock time-related functions
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Stop cleanup timer after all tests complete
  afterAll(() => {
    tokenManager.stopCleanupTimer();
  });

  test('should store and retrieve tokens', () => {
    const userId = 'test-user';
    const accessToken = 'test-access-token';
    const refreshToken = 'test-refresh-token';

    tokenManager.storeTokens(userId, accessToken, 3600000, refreshToken);
    const { accessToken: retrievedAccess, refreshToken: retrievedRefresh } = tokenManager.getTokens(userId);

    expect(retrievedAccess).toBe(accessToken);
    expect(retrievedRefresh).toBe(refreshToken);
  });

  test('should return null for non-existent tokens', () => {
    const { accessToken, refreshToken } = tokenManager.getTokens('non-existent-user');
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
  });

  test('should handle access token expiration while keeping refresh token', () => {
    const userId = 'expiring-user';
    const accessToken = 'expiring-access-token';
    const refreshToken = 'long-lived-refresh-token';

    // Access token expires in 1 second, refresh token in 30 days
    tokenManager.storeTokens(userId, accessToken, 1000, refreshToken, 30 * 24 * 60 * 60 * 1000);

    // Before expiration
    let tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBe(accessToken);
    expect(tokens.refreshToken).toBe(refreshToken);

    // Advance time (only access token expires)
    jest.advanceTimersByTime(1100);

    // Access token is expired, refresh token is still valid
    tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBeNull();
    expect(tokens.refreshToken).toBe(refreshToken);
  });

  test('should handle both tokens expiration', () => {
    const userId = 'both-expiring-user';
    const accessToken = 'access-token';
    const refreshToken = 'refresh-token';

    // Both tokens have short expiration
    tokenManager.storeTokens(userId, accessToken, 1000, refreshToken, 2000);

    // Before expiration
    let tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBe(accessToken);
    expect(tokens.refreshToken).toBe(refreshToken);

    // Advance time (both tokens expire)
    jest.advanceTimersByTime(2100);

    // Both tokens are expired
    tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBeNull();
    expect(tokens.refreshToken).toBeNull();
  });

  test('should remove tokens', () => {
    const userId = 'remove-test-user';
    const accessToken = 'access-to-remove';
    const refreshToken = 'refresh-to-remove';

    tokenManager.storeTokens(userId, accessToken, 3600000, refreshToken);

    let tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBe(accessToken);
    expect(tokens.refreshToken).toBe(refreshToken);

    tokenManager.removeTokens(userId);

    tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBeNull();
    expect(tokens.refreshToken).toBeNull();
  });

  test('should store only access token', () => {
    const userId = 'access-only-user';
    const accessToken = 'only-access-token';

    tokenManager.storeTokens(userId, accessToken, 3600000);

    const tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBe(accessToken);
    expect(tokens.refreshToken).toBeNull();
  });

  test('should store only refresh token', () => {
    const userId = 'refresh-only-user';
    const refreshToken = 'only-refresh-token';

    tokenManager.storeTokens(userId, undefined, undefined, refreshToken);

    const tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBeNull();
    expect(tokens.refreshToken).toBe(refreshToken);
  });

  test('should update existing tokens', () => {
    const userId = 'update-user';
    const accessToken1 = 'access-token-1';
    const refreshToken1 = 'refresh-token-1';
    const accessToken2 = 'access-token-2';

    // Initial save
    tokenManager.storeTokens(userId, accessToken1, 3600000, refreshToken1);

    let tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBe(accessToken1);
    expect(tokens.refreshToken).toBe(refreshToken1);

    // Update only access token (refresh token is preserved)
    tokenManager.storeTokens(userId, accessToken2, 3600000);

    tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBe(accessToken2);
    expect(tokens.refreshToken).toBe(refreshToken1);
  });

  test('should cleanup expired tokens automatically', () => {
    const userId1 = 'user1';
    const userId2 = 'user2';

    // user1: both tokens have short expiration
    tokenManager.storeTokens(userId1, 'access1', 1000, 'refresh1', 1000);
    // user2: long expiration
    tokenManager.storeTokens(userId2, 'access2', 10000, 'refresh2', 10000);

    // Verify both tokens can be retrieved
    expect(tokenManager.getTokens(userId1).accessToken).toBe('access1');
    expect(tokenManager.getTokens(userId2).accessToken).toBe('access2');

    // Advance 2 seconds (only userId1's tokens expire)
    jest.advanceTimersByTime(2000);

    // Manually call cleanup
    (tokenManager as any).cleanupExpiredTokens();

    // Expired tokens return null, valid tokens can still be retrieved
    const tokens1 = tokenManager.getTokens(userId1);
    expect(tokens1.accessToken).toBeNull();
    expect(tokens1.refreshToken).toBeNull();

    const tokens2 = tokenManager.getTokens(userId2);
    expect(tokens2.accessToken).toBe('access2');
    expect(tokens2.refreshToken).toBe('refresh2');
  });

  test('should handle encryption/decryption', () => {
    // Test to verify encryption/decryption
    const users = ['user-a', 'user-b', 'user-c'];
    const accessTokens = ['access-a', 'access-b', 'access-c'];
    const refreshTokens = ['refresh-a', 'refresh-b', 'refresh-c'];

    // Store multiple tokens
    users.forEach((userId, index) => {
      tokenManager.storeTokens(userId, accessTokens[index], 3600000, refreshTokens[index]);
    });

    // Verify all tokens can be retrieved correctly
    users.forEach((userId, index) => {
      const tokens = tokenManager.getTokens(userId);
      expect(tokens.accessToken).toBe(accessTokens[index]);
      expect(tokens.refreshToken).toBe(refreshTokens[index]);
    });

    // Remove a token randomly
    tokenManager.removeTokens(users[1]);

    // Removed token returns null, other tokens are still available
    expect(tokenManager.getTokens(users[0]).accessToken).toBe(accessTokens[0]);
    expect(tokenManager.getTokens(users[1]).accessToken).toBeNull();
    expect(tokenManager.getTokens(users[2]).accessToken).toBe(accessTokens[2]);
  });
});
