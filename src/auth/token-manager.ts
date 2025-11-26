// src/auth/token-manager.ts
import crypto from 'crypto';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * トークンデータの型定義
 */
interface TokenData {
  value: string; // 暗号化されたトークン値
  expiresAt: number; // 有効期限（タイムスタンプ）
}

/**
 * ユーザーのトークン情報
 */
interface UserTokens {
  accessToken?: TokenData;
  refreshToken?: TokenData;
}

/**
 * ファイル保存形式
 */
interface TokensFileData {
  [userId: string]: UserTokens;
}

/**
 * TokenManager - セキュアなトークン管理クラス
 *
 * トークンを暗号化してメモリ内とファイルに保存し、必要に応じて復号化して取得する
 * AES-256-GCM暗号化を使用して高いセキュリティを提供
 */
class TokenManager {
  private algorithm = 'aes-256-gcm';
  private encryptionKey: Buffer;
  private userTokens: Map<string, UserTokens> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private tokensFilePath: string;
  private encryptionKeyFilePath: string;
  private configDir: string;

  constructor() {
    // 設定ディレクトリのパスを設定
    this.configDir = path.join(os.homedir(), '.google-calendar-mcp');
    this.tokensFilePath = path.join(this.configDir, 'tokens.json');
    this.encryptionKeyFilePath = path.join(this.configDir, 'encryption-key.txt');

    // 設定ディレクトリが存在しない場合は作成
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
      if (typeof logger.info === 'function') {
        logger.info(`Created config directory: ${this.configDir}`);
      }
    }

    // 暗号化キーを読み込みまたは生成
    this.encryptionKey = this.loadOrGenerateEncryptionKey();

    if (typeof logger.info === 'function') {
      logger.info('TokenManager initialized with secure encryption');
    }

    // 起動時にファイルからトークンを読み込む
    this.loadTokensFromFile();

    // 定期的に期限切れトークンをクリーンアップ
    this.cleanupInterval = setInterval(this.cleanupExpiredTokens.bind(this), 60 * 60 * 1000); // 1時間ごと
  }

  /**
   * 暗号化キーを読み込むか、存在しない場合は生成して保存
   *
   * @returns 暗号化キー
   */
  private loadOrGenerateEncryptionKey(): Buffer {
    // 環境変数から暗号化キーを取得（優先度最高）
    if (process.env.TOKEN_ENCRYPTION_KEY) {
      if (typeof logger.info === 'function') {
        logger.info('Using encryption key from environment variable');
      }
      return Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');
    }

    // ファイルから暗号化キーを読み込む
    if (fs.existsSync(this.encryptionKeyFilePath)) {
      try {
        const keyString = fs.readFileSync(this.encryptionKeyFilePath, 'utf8').trim();
        if (keyString && keyString.length === 64) {
          if (typeof logger.info === 'function') {
            logger.info('Loaded encryption key from file');
          }
          return Buffer.from(keyString, 'hex');
        } else {
          if (typeof logger.warn === 'function') {
            logger.warn('Invalid encryption key in file, generating new one');
          }
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (typeof logger.warn === 'function') {
          logger.warn('Failed to read encryption key from file, generating new one', { error: error.message });
        }
      }
    }

    // 新しい暗号化キーを生成して保存
    const newKey = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(this.encryptionKeyFilePath, newKey, { mode: 0o600 });
      if (typeof logger.info === 'function') {
        logger.info(`Generated new encryption key and saved to ${this.encryptionKeyFilePath}`);
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (typeof logger.error === 'function') {
        logger.error('Failed to save encryption key to file', { error: error.message });
      }
    }

    return Buffer.from(newKey, 'hex');
  }

  /**
   * トークンを暗号化
   */
  private encrypt(token: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = (cipher as any).getAuthTag();

    // 初期化ベクトル、認証タグ、暗号文を連結
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * トークンを復号化
   */
  private decrypt(encryptedData: string): string | null {
    try {
      const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      (decipher as any).setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err: unknown) {
      const error = err as Error;
      if (typeof logger.error === 'function') {
        logger.error('Failed to decrypt token', { error: error.message });
      }
      return null;
    }
  }

  /**
   * ユーザーのトークンを保存
   *
   * @param userId ユーザーID
   * @param accessToken アクセストークン（オプション）
   * @param accessTokenExpiresIn アクセストークンの有効期限（ミリ秒）
   * @param refreshToken リフレッシュトークン（オプション）
   * @param refreshTokenExpiresIn リフレッシュトークンの有効期限（ミリ秒）、デフォルト30日
   */
  public storeTokens(
    userId: string,
    accessToken?: string,
    accessTokenExpiresIn?: number,
    refreshToken?: string,
    refreshTokenExpiresIn: number = 30 * 24 * 60 * 60 * 1000
  ): void {
    try {
      const existingTokens = this.userTokens.get(userId) || {};
      const updatedTokens: UserTokens = { ...existingTokens };

      if (accessToken) {
        const expiresAt = Date.now() + (accessTokenExpiresIn || 3600 * 1000);
        updatedTokens.accessToken = {
          value: this.encrypt(accessToken),
          expiresAt,
        };
        if (typeof logger.debug === 'function') {
          logger.debug(`Access token stored for user: ${userId}, expires: ${new Date(expiresAt).toISOString()}`);
        }
      }

      if (refreshToken) {
        const expiresAt = Date.now() + refreshTokenExpiresIn;
        updatedTokens.refreshToken = {
          value: this.encrypt(refreshToken),
          expiresAt,
        };
        if (typeof logger.debug === 'function') {
          logger.debug(`Refresh token stored for user: ${userId}, expires: ${new Date(expiresAt).toISOString()}`);
        }
      }

      this.userTokens.set(userId, updatedTokens);

      // ファイルに保存
      this.saveTokensToFile();
    } catch (err: unknown) {
      const error = err as Error;
      if (typeof logger.error === 'function') {
        logger.error('Failed to encrypt and store tokens', { userId, error: error.message });
      }
      throw new Error('Token encryption failed');
    }
  }

  /**
   * ユーザーのトークンを取得
   *
   * @param userId ユーザーID
   * @returns アクセストークンとリフレッシュトークン
   */
  public getTokens(userId: string): { accessToken: string | null; refreshToken: string | null } {
    const userTokens = this.userTokens.get(userId);

    if (!userTokens) {
      if (typeof logger.debug === 'function') {
        logger.debug(`No tokens found for user: ${userId}`);
      }
      return { accessToken: null, refreshToken: null };
    }

    const now = Date.now();
    let accessToken: string | null = null;
    let refreshToken: string | null = null;

    // アクセストークンの取得と有効期限チェック
    if (userTokens.accessToken) {
      if (userTokens.accessToken.expiresAt > now) {
        accessToken = this.decrypt(userTokens.accessToken.value);
      } else {
        if (typeof logger.debug === 'function') {
          logger.debug(`Access token expired for user: ${userId}`);
        }
        // 期限切れのアクセストークンを削除
        userTokens.accessToken = undefined;
      }
    }

    // リフレッシュトークンの取得と有効期限チェック
    if (userTokens.refreshToken) {
      if (userTokens.refreshToken.expiresAt > now) {
        refreshToken = this.decrypt(userTokens.refreshToken.value);
      } else {
        if (typeof logger.debug === 'function') {
          logger.debug(`Refresh token expired for user: ${userId}`);
        }
        // 期限切れのリフレッシュトークンを削除
        userTokens.refreshToken = undefined;
      }
    }

    // 両方のトークンが削除された場合、ユーザーエントリを削除
    if (!userTokens.accessToken && !userTokens.refreshToken) {
      this.userTokens.delete(userId);
      this.saveTokensToFile();
    }

    return { accessToken, refreshToken };
  }

  /**
   * ユーザーのトークンを削除
   *
   * @param userId ユーザーID
   */
  public removeTokens(userId: string): void {
    this.userTokens.delete(userId);
    if (typeof logger.debug === 'function') {
      logger.debug(`Tokens removed for user: ${userId}`);
    }
    // ファイルに保存
    this.saveTokensToFile();
  }

  /**
   * 期限切れのトークンをクリーンアップ
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, tokens] of this.userTokens.entries()) {
      let modified = false;

      if (tokens.accessToken && tokens.accessToken.expiresAt <= now) {
        tokens.accessToken = undefined;
        modified = true;
      }

      if (tokens.refreshToken && tokens.refreshToken.expiresAt <= now) {
        tokens.refreshToken = undefined;
        modified = true;
      }

      if (!tokens.accessToken && !tokens.refreshToken) {
        this.userTokens.delete(userId);
        cleanedCount++;
      } else if (modified) {
        this.userTokens.set(userId, tokens);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.saveTokensToFile();
      if (typeof logger.info === 'function') {
        logger.info(`Cleaned up expired tokens for ${cleanedCount} users`);
      }
    }
  }

  /**
   * トークンをファイルに保存
   */
  private saveTokensToFile(): void {
    try {
      const data: TokensFileData = {};

      for (const [userId, tokens] of this.userTokens.entries()) {
        data[userId] = tokens;
      }

      fs.writeFileSync(this.tokensFilePath, JSON.stringify(data, null, 2), 'utf8');
      if (typeof logger.debug === 'function') {
        logger.debug(`Tokens saved to file: ${this.tokensFilePath}`);
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (typeof logger.error === 'function') {
        logger.error('Failed to save tokens to file', { error: error.message });
      }
    }
  }

  /**
   * ファイルからトークンを読み込む
   */
  private loadTokensFromFile(): void {
    try {
      if (!fs.existsSync(this.tokensFilePath)) {
        if (typeof logger.debug === 'function') {
          logger.debug('No tokens file found, starting with empty tokens');
        }
        return;
      }

      const fileContent = fs.readFileSync(this.tokensFilePath, 'utf8');
      const data = JSON.parse(fileContent);

      // 新形式のデータを読み込む
      if (data && typeof data === 'object' && !Array.isArray(data.tokens)) {
        for (const [userId, tokens] of Object.entries(data)) {
          if (tokens && typeof tokens === 'object') {
            this.userTokens.set(userId, tokens as UserTokens);
          }
        }
      } else if (data.tokens && Array.isArray(data.tokens)) {
        // 旧形式からのマイグレーション
        this.migrateFromOldFormat(data);
      }

      // 期限切れのトークンをクリーンアップ
      this.cleanupExpiredTokens();

      if (typeof logger.info === 'function') {
        logger.info(`Loaded tokens for ${this.userTokens.size} users from file`);
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (typeof logger.error === 'function') {
        logger.error('Failed to load tokens from file', { error: error.message });
      }
    }
  }

  /**
   * 旧形式からのマイグレーション
   */
  private migrateFromOldFormat(data: { tokens: [string, string][]; expirations: [string, number][] }): void {
    if (typeof logger.info === 'function') {
      logger.info('Migrating tokens from old format to new format');
    }

    const oldTokens = new Map<string, string>(data.tokens);
    const oldExpirations = new Map<string, number>(data.expirations);

    // ユーザーIDを収集（_access サフィックスを除去）
    const userIds = new Set<string>();
    for (const key of oldTokens.keys()) {
      const userId = key.replace(/_access$/, '');
      userIds.add(userId);
    }

    // 各ユーザーのトークンを新形式に変換
    for (const userId of userIds) {
      const refreshTokenValue = oldTokens.get(userId);
      const accessTokenValue = oldTokens.get(`${userId}_access`);
      const refreshTokenExpiry = oldExpirations.get(userId);
      const accessTokenExpiry = oldExpirations.get(`${userId}_access`);

      const userTokens: UserTokens = {};

      if (accessTokenValue && accessTokenExpiry) {
        userTokens.accessToken = {
          value: accessTokenValue,
          expiresAt: accessTokenExpiry,
        };
      }

      if (refreshTokenValue && refreshTokenExpiry) {
        userTokens.refreshToken = {
          value: refreshTokenValue,
          expiresAt: refreshTokenExpiry,
        };
      }

      if (userTokens.accessToken || userTokens.refreshToken) {
        this.userTokens.set(userId, userTokens);
      }
    }

    // 新形式で保存
    this.saveTokensToFile();

    if (typeof logger.info === 'function') {
      logger.info('Migration completed successfully');
    }
  }

  /**
   * クリーンアップタイマーを停止し、リソースを解放する
   * テスト環境やアプリケーション終了時に呼び出すべき
   */
  public stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      if (typeof logger.debug === 'function') {
        logger.debug('TokenManager cleanup timer stopped');
      }
    }
  }
}

// シングルトンインスタンスをエクスポート
export const tokenManager = new TokenManager();
