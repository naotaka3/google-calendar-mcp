// src/auth/token-manager.ts
import crypto from 'crypto';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * TokenManager - セキュアなトークン管理クラス
 *
 * トークンを暗号化してメモリ内とファイルに保存し、必要に応じて復号化して取得する
 * AES-256-GCM暗号化を使用して高いセキュリティを提供
 */
class TokenManager {
  private algorithm = 'aes-256-gcm';
  private encryptionKey: Buffer;
  private tokens: Map<string, string> = new Map();
  private tokenExpirations: Map<string, number> = new Map();
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
   * トークンを暗号化して保存
   *
   * @param userId ユーザーID
   * @param token 保存するトークン
   * @param expiresIn トークンの有効期限（ミリ秒）、デフォルト30日
   */
  public storeToken(userId: string, token: string, expiresIn: number = 30 * 24 * 60 * 60 * 1000): void {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

      let encrypted = cipher.update(token, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // crypto.Cipher.prototype.getAuthTag は @types/node に定義されていないが、実際のNodeJSには存在する
      const authTag = (cipher as any).getAuthTag();

      // 初期化ベクトル、認証タグ、暗号文を連結して保存
      const tokenData = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
      this.tokens.set(userId, tokenData);

      // 有効期限を設定
      const expiryTime = Date.now() + expiresIn;
      this.tokenExpirations.set(userId, expiryTime);

      if (typeof logger.debug === 'function') {
        logger.debug(`Token stored for user: ${userId}, expires: ${new Date(expiryTime).toISOString()}`);
      }

      // ファイルに保存
      this.saveTokensToFile();
    } catch (err: unknown) {
      const error = err as Error;
      if (typeof logger.error === 'function') {
        logger.error('Failed to encrypt and store token', { userId, error: error.message });
      }
      throw new Error('Token encryption failed');
    }
  }

  /**
   * 保存されたトークンを復号化して取得
   * 
   * @param userId ユーザーID
   * @returns 復号化されたトークン、または存在しない場合はnull
   */
  public getToken(userId: string): string | null {
    const tokenData = this.tokens.get(userId);
    if (!tokenData) {
      if (typeof logger.debug === 'function') {
        logger.debug(`No token found for user: ${userId}`);
      }
      return null;
    }

    // トークンの有効期限をチェック
    const expiry = this.tokenExpirations.get(userId);
    if (expiry && expiry < Date.now()) {
      if (typeof logger.debug === 'function') {
        logger.debug(`Token expired for user: ${userId}`);
      }
      this.removeToken(userId);
      return null;
    }

    try {
      const [ivHex, authTagHex, encrypted] = tokenData.split(':');

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);

      // crypto.Decipher.prototype.setAuthTag は @types/node に定義されていないが、実際のNodeJSには存在する
      (decipher as any).setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err: unknown) {
      const error = err as Error;
      if (typeof logger.error === 'function') {
        logger.error('Failed to decrypt token', { userId, error: error.message });
      }
      return null;
    }
  }

  /**
   * トークンを削除
   *
   * @param userId ユーザーID
   */
  public removeToken(userId: string): void {
    this.tokens.delete(userId);
    this.tokenExpirations.delete(userId);
    if (typeof logger.debug === 'function') {
      logger.debug(`Token removed for user: ${userId}`);
    }
    // ファイルに保存
    this.saveTokensToFile();
  }

  /**
   * 期限切れのトークンをクリーンアップ
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [userId, expiry] of this.tokenExpirations.entries()) {
      if (expiry < now) {
        this.removeToken(userId);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      if (typeof logger.info === 'function') {
        logger.info(`Cleaned up ${expiredCount} expired tokens`);
      }
    }
  }

  /**
   * トークンをファイルに保存
   */
  private saveTokensToFile(): void {
    try {
      const data = {
        tokens: Array.from(this.tokens.entries()),
        expirations: Array.from(this.tokenExpirations.entries()),
      };
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

      if (data.tokens && Array.isArray(data.tokens)) {
        this.tokens = new Map(data.tokens);
      }

      if (data.expirations && Array.isArray(data.expirations)) {
        this.tokenExpirations = new Map(data.expirations);
      }

      // 期限切れのトークンをクリーンアップ
      this.cleanupExpiredTokens();

      if (typeof logger.info === 'function') {
        logger.info(`Loaded ${this.tokens.size} tokens from file`);
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (typeof logger.error === 'function') {
        logger.error('Failed to load tokens from file', { error: error.message });
      }
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
