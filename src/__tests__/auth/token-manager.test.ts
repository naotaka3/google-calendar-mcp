// src/__tests__/auth/token-manager.test.ts

// fsモジュールをモック（token-managerのインポート前にモックする必要がある）
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(''),
}));

// モックロガー
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
    // テスト間での干渉を防ぐためにトークンをクリア
    (tokenManager as any).userTokens = new Map();

    // 時間関連のモック
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // すべてのテスト完了後にクリーンアップタイマーを停止
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

    // アクセストークンは1秒、リフレッシュトークンは30日
    tokenManager.storeTokens(userId, accessToken, 1000, refreshToken, 30 * 24 * 60 * 60 * 1000);

    // 期限切れ前
    let tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBe(accessToken);
    expect(tokens.refreshToken).toBe(refreshToken);

    // 時間を進める（アクセストークンのみ期限切れ）
    jest.advanceTimersByTime(1100);

    // アクセストークンは期限切れ、リフレッシュトークンは有効
    tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBeNull();
    expect(tokens.refreshToken).toBe(refreshToken);
  });

  test('should handle both tokens expiration', () => {
    const userId = 'both-expiring-user';
    const accessToken = 'access-token';
    const refreshToken = 'refresh-token';

    // 両方とも短い期限
    tokenManager.storeTokens(userId, accessToken, 1000, refreshToken, 2000);

    // 期限切れ前
    let tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBe(accessToken);
    expect(tokens.refreshToken).toBe(refreshToken);

    // 時間を進める（両方期限切れ）
    jest.advanceTimersByTime(2100);

    // 両方期限切れ
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

    // 初回保存
    tokenManager.storeTokens(userId, accessToken1, 3600000, refreshToken1);

    let tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBe(accessToken1);
    expect(tokens.refreshToken).toBe(refreshToken1);

    // アクセストークンのみ更新（リフレッシュトークンは保持）
    tokenManager.storeTokens(userId, accessToken2, 3600000);

    tokens = tokenManager.getTokens(userId);
    expect(tokens.accessToken).toBe(accessToken2);
    expect(tokens.refreshToken).toBe(refreshToken1);
  });

  test('should cleanup expired tokens automatically', () => {
    const userId1 = 'user1';
    const userId2 = 'user2';

    // user1: 両方短い期限
    tokenManager.storeTokens(userId1, 'access1', 1000, 'refresh1', 1000);
    // user2: 長い期限
    tokenManager.storeTokens(userId2, 'access2', 10000, 'refresh2', 10000);

    // 両方のトークンが取得できることを確認
    expect(tokenManager.getTokens(userId1).accessToken).toBe('access1');
    expect(tokenManager.getTokens(userId2).accessToken).toBe('access2');

    // 2秒進める（userId1のトークンのみ期限切れ）
    jest.advanceTimersByTime(2000);

    // クリーンアップを手動で呼び出す
    (tokenManager as any).cleanupExpiredTokens();

    // 期限切れのトークンはnull、期限内のトークンは取得できる
    const tokens1 = tokenManager.getTokens(userId1);
    expect(tokens1.accessToken).toBeNull();
    expect(tokens1.refreshToken).toBeNull();

    const tokens2 = tokenManager.getTokens(userId2);
    expect(tokens2.accessToken).toBe('access2');
    expect(tokens2.refreshToken).toBe('refresh2');
  });

  test('should handle encryption/decryption', () => {
    // 暗号化/復号化を確認するテスト
    const users = ['user-a', 'user-b', 'user-c'];
    const accessTokens = ['access-a', 'access-b', 'access-c'];
    const refreshTokens = ['refresh-a', 'refresh-b', 'refresh-c'];

    // 複数のトークンを保存
    users.forEach((userId, index) => {
      tokenManager.storeTokens(userId, accessTokens[index], 3600000, refreshTokens[index]);
    });

    // すべてのトークンが正しく取得できることを確認
    users.forEach((userId, index) => {
      const tokens = tokenManager.getTokens(userId);
      expect(tokens.accessToken).toBe(accessTokens[index]);
      expect(tokens.refreshToken).toBe(refreshTokens[index]);
    });

    // ランダムにトークンを削除
    tokenManager.removeTokens(users[1]);

    // 削除されたトークンはnull、他のトークンは利用可能
    expect(tokenManager.getTokens(users[0]).accessToken).toBe(accessTokens[0]);
    expect(tokenManager.getTokens(users[1]).accessToken).toBeNull();
    expect(tokenManager.getTokens(users[2]).accessToken).toBe(accessTokens[2]);
  });
});
