// src/auth/token-manager.ts
import crypto from 'crypto';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Token data type definition
 */
interface TokenData {
  value: string; // Encrypted token value
  expiresAt: number; // Expiration timestamp
}

/**
 * User token information
 */
interface UserTokens {
  accessToken?: TokenData;
  refreshToken?: TokenData;
}

/**
 * File storage format
 */
interface TokensFileData {
  [userId: string]: UserTokens;
}

/**
 * TokenManager - Secure token management class
 *
 * Encrypts and stores tokens in memory and file, decrypts and retrieves them as needed
 * Uses AES-256-GCM encryption for high security
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
    // Set config directory path
    this.configDir = path.join(os.homedir(), '.google-calendar-mcp');
    this.tokensFilePath = path.join(this.configDir, 'tokens.json');
    this.encryptionKeyFilePath = path.join(this.configDir, 'encryption-key.txt');

    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
      if (typeof logger.info === 'function') {
        logger.info(`Created config directory: ${this.configDir}`);
      }
    }

    // Load or generate encryption key
    this.encryptionKey = this.loadOrGenerateEncryptionKey();

    if (typeof logger.info === 'function') {
      logger.info('TokenManager initialized with secure encryption');
    }

    // Load tokens from file on startup
    this.loadTokensFromFile();

    // Periodically cleanup expired tokens (every hour)
    this.cleanupInterval = setInterval(this.cleanupExpiredTokens.bind(this), 60 * 60 * 1000);
  }

  /**
   * Load encryption key from file, or generate and save if it doesn't exist
   *
   * @returns Encryption key
   */
  private loadOrGenerateEncryptionKey(): Buffer {
    // Get encryption key from environment variable (highest priority)
    if (process.env.TOKEN_ENCRYPTION_KEY) {
      if (typeof logger.info === 'function') {
        logger.info('Using encryption key from environment variable');
      }
      return Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');
    }

    // Load encryption key from file
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

    // Generate and save a new encryption key
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
   * Encrypt a token
   */
  private encrypt(token: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = (cipher as any).getAuthTag();

    // Concatenate initialization vector, auth tag, and ciphertext
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a token
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
   * Store user tokens
   *
   * @param userId User ID
   * @param accessToken Access token (optional)
   * @param accessTokenExpiresIn Access token expiration time in milliseconds
   * @param refreshToken Refresh token (optional)
   * @param refreshTokenExpiresIn Refresh token expiration time in milliseconds, default 30 days
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

      // Save to file
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
   * Get user tokens
   *
   * @param userId User ID
   * @returns Access token and refresh token
   */
  public getTokens(userId: string): { accessToken: string | null; refreshToken: string | null } {
    const userTokens = this.userTokens.get(userId);

    if (!userTokens) {
      return { accessToken: null, refreshToken: null };
    }

    const now = Date.now();
    let accessToken: string | null = null;
    let refreshToken: string | null = null;

    // Get access token and check expiration
    if (userTokens.accessToken) {
      if (userTokens.accessToken.expiresAt > now) {
        accessToken = this.decrypt(userTokens.accessToken.value);
      } else {
        if (typeof logger.debug === 'function') {
          logger.debug(`Access token expired for user: ${userId}`);
        }
        // Remove expired access token
        userTokens.accessToken = undefined;
      }
    }

    // Get refresh token and check expiration
    if (userTokens.refreshToken) {
      if (userTokens.refreshToken.expiresAt > now) {
        refreshToken = this.decrypt(userTokens.refreshToken.value);
      } else {
        if (typeof logger.debug === 'function') {
          logger.debug(`Refresh token expired for user: ${userId}`);
        }
        // Remove expired refresh token
        userTokens.refreshToken = undefined;
      }
    }

    // Delete user entry if both tokens are removed
    if (!userTokens.accessToken && !userTokens.refreshToken) {
      this.userTokens.delete(userId);
      this.saveTokensToFile();
    }

    return { accessToken, refreshToken };
  }

  /**
   * Remove user tokens
   *
   * @param userId User ID
   */
  public removeTokens(userId: string): void {
    this.userTokens.delete(userId);
    if (typeof logger.debug === 'function') {
      logger.debug(`Tokens removed for user: ${userId}`);
    }
    // Save to file
    this.saveTokensToFile();
  }

  /**
   * Cleanup expired tokens
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
   * Save tokens to file
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
   * Load tokens from file
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

      // Load data in new format
      if (data && typeof data === 'object' && !Array.isArray(data.tokens)) {
        for (const [userId, tokens] of Object.entries(data)) {
          if (tokens && typeof tokens === 'object') {
            this.userTokens.set(userId, tokens as UserTokens);
          }
        }
      } else if (data.tokens && Array.isArray(data.tokens)) {
        // Migration from old format
        this.migrateFromOldFormat(data);
      }

      // Cleanup expired tokens
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
   * Migration from old format
   */
  private migrateFromOldFormat(data: { tokens: [string, string][]; expirations: [string, number][] }): void {
    if (typeof logger.info === 'function') {
      logger.info('Migrating tokens from old format to new format');
    }

    const oldTokens = new Map<string, string>(data.tokens);
    const oldExpirations = new Map<string, number>(data.expirations);

    // Collect user IDs (remove _access suffix)
    const userIds = new Set<string>();
    for (const key of oldTokens.keys()) {
      const userId = key.replace(/_access$/, '');
      userIds.add(userId);
    }

    // Convert each user's tokens to new format
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

    // Save in new format
    this.saveTokensToFile();

    if (typeof logger.info === 'function') {
      logger.info('Migration completed successfully');
    }
  }

  /**
   * Stop cleanup timer and release resources
   * Should be called in test environments or at application shutdown
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

// Export singleton instance
export const tokenManager = new TokenManager();
