// src/auth/oauth-auth.ts
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import express, { Express } from 'express';
import { OAuthHandler } from './oauth-handler';
import config from '../config/config';
import logger from '../utils/logger';
import { tokenManager } from './token-manager';
import readline from 'readline';
import { Server } from 'http';

interface AuthPromiseCallbacks {
  resolve: (client: OAuth2Client) => void;
  reject: (error: Error) => void;
}

/**
 * AuthSession - Manages a single authentication session
 */
class AuthSession {
  private pendingCallbacks: AuthPromiseCallbacks[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private _isCancelled: boolean = false;

  get isCancelled(): boolean {
    return this._isCancelled;
  }

  addCallback(callback: AuthPromiseCallbacks): void {
    this.pendingCallbacks.push(callback);
  }

  setIntervalId(id: NodeJS.Timeout): void {
    this.intervalId = id;
  }

  setTimeoutId(id: NodeJS.Timeout): void {
    this.timeoutId = id;
  }

  /**
   * Cancel this session (clear timers only, don't reject callbacks)
   */
  cancel(): void {
    if (this._isCancelled) return;
    this._isCancelled = true;

    // Clear timers only
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    // Don't reject callbacks - they will be handled by the new session
  }

  /**
   * Resolve all pending callbacks with the client
   */
  resolveAll(client: OAuth2Client): void {
    if (this._isCancelled) return;

    // Clear timers
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    for (const cb of this.pendingCallbacks) {
      cb.resolve(client);
    }
    this.pendingCallbacks = [];
  }

  /**
   * Reject all pending callbacks with an error
   */
  rejectAll(error: Error): void {
    if (this._isCancelled) return;

    // Clear timers
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    for (const cb of this.pendingCallbacks) {
      cb.reject(error);
    }
    this.pendingCallbacks = [];
  }
}

/**
 * OAuthAuth - Google authentication class using OAuthHandler
 *
 * Processes Google OAuth authentication using OAuthHandler,
 * providing an interface similar to GoogleAuth.
 */
class OAuthAuth {
  private oauth2Client: OAuth2Client;
  private expressApp: express.Application;
  private oauthHandler: OAuthHandler;
  private server: Server | null = null;
  private currentSession: AuthSession | null = null;
  private isServerRunning: boolean = false;

  constructor() {
    // Initialize OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    // Initialize Express application
    this.expressApp = express();

    // Initialize OAuthHandler
    this.oauthHandler = new OAuthHandler(this.expressApp as Express);

    // Server will be started on-demand when needed
    logger.info('OAuth server will be started when authentication is needed');

    // Load saved tokens from TokenManager if available
    this.loadSavedTokens();
  }

  /**
   * Clear all tokens and credentials (used for force re-authentication)
   */
  public clearTokens(): void {
    const userId = 'default-user';
    tokenManager.removeTokens(userId);
    this.oauth2Client.credentials = {};
    logger.info('Cleared all tokens and credentials');
  }

  /**
   * Load saved tokens from TokenManager
   */
  private loadSavedTokens(): void {
    const userId = 'default-user';
    const { accessToken, refreshToken } = tokenManager.getTokens(userId);

    // Set credentials if refresh token exists, regardless of access token availability
    if (refreshToken || accessToken) {
      const credentials: any = {};

      if (accessToken) {
        credentials.access_token = accessToken;
      }

      if (refreshToken) {
        credentials.refresh_token = refreshToken;
      }

      this.oauth2Client.setCredentials(credentials);

      if (accessToken && refreshToken) {
        logger.info('Loaded saved tokens from file');
      } else if (refreshToken) {
        logger.info(
          'Loaded refresh token from file (access token expired, will refresh on next request)'
        );
      } else {
        logger.info('Loaded access token from file (no refresh token)');
      }
    } else {
      logger.debug('No saved tokens found, authentication will be required');
    }
  }

  // Get or refresh token
  async getAuthenticatedClient(): Promise<OAuth2Client> {
    // If access token exists and is valid, return the client
    if (this.oauth2Client.credentials && this.oauth2Client.credentials.access_token) {
      // Check if token is expired
      if (this.isTokenExpired(this.oauth2Client.credentials)) {
        logger.info('Token expired, refreshing...');
        await this.refreshToken();
      }
      return this.oauth2Client;
    }

    // If only refresh token exists (access token expired/missing), try to refresh
    if (this.oauth2Client.credentials && this.oauth2Client.credentials.refresh_token) {
      logger.info('No access token, but refresh token available. Refreshing...');
      await this.refreshToken();
      return this.oauth2Client;
    }

    // No authentication available
    throw new Error('Authentication required. Please use the authenticate tool to authenticate.');
  }

  // Check token expiration
  private isTokenExpired(token: any): boolean {
    if (!token.expiry_date) return true;
    return token.expiry_date <= Date.now();
  }

  // Refresh token
  private async refreshToken(): Promise<void> {
    try {
      // If there's no refresh token, throw an error
      if (!this.oauth2Client.credentials.refresh_token) {
        logger.warn('No refresh token available');
        // Clear existing credentials
        this.oauth2Client.credentials = {};
        throw new Error(
          'No refresh token available. Please use the authenticate tool to re-authenticate.'
        );
      }

      // If there's a refresh token, perform normal refresh
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);

      // Also store the refreshed access token in the token manager
      if (credentials.access_token) {
        const userId = 'default-user';
        const expiresIn = credentials.expiry_date
          ? credentials.expiry_date - Date.now()
          : 3600 * 1000;
        tokenManager.storeTokens(userId, credentials.access_token, expiresIn);
        logger.info('Successfully refreshed and stored access token');
      }
    } catch (error) {
      logger.error(`Failed to refresh token: ${error}`);
      // Clear existing credentials
      this.oauth2Client.credentials = {};
      throw error;
    }
  }

  // Shut down the authentication server
  private shutdownServer(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server && this.isServerRunning) {
        logger.info('Shutting down OAuth server');
        const serverToClose = this.server;
        this.server = null;
        this.isServerRunning = false;
        serverToClose.close(() => {
          logger.info('OAuth server has been shut down');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Start or restart the authentication server
  private startServer(): void {
    if (!this.isServerRunning) {
      try {
        this.server = this.expressApp.listen(config.auth.port, config.auth.host, () => {
          logger.info(`OAuth server started on ${config.auth.host}:${config.auth.port}`);
          this.isServerRunning = true;
        });

        // Add error handling
        this.server.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            logger.warn(
              `Port ${config.auth.port} is already in use, assuming OAuth server is already running`
            );
            // Set server object to null to indicate that we're using an existing server
            this.server = null;
            this.isServerRunning = false;
          } else {
            logger.error(`OAuth server error: ${err}`);
            this.isServerRunning = false;
          }
        });
      } catch (err) {
        logger.warn(`Could not start OAuth server: ${err}`);
        // Set server object to null
        this.server = null;
        this.isServerRunning = false;
      }
    }
  }

  // Create a readline interface for manual code input
  private createReadlineInterface(): readline.Interface {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  // Handle manual authentication flow
  private async handleManualAuth(userId: string): Promise<OAuth2Client> {
    try {
      // Generate authentication URL for manual auth
      const redirectUri = `http://${config.auth.host}:${config.auth.port}/auth-success`;
      const { authUrl, state } = this.oauthHandler.generateAuthUrl(userId, redirectUri, true);

      logger.info(`Please authorize this app by visiting this URL: ${authUrl}`);

      // Try to open the browser automatically
      try {
        import('open')
          .then((openModule) => {
            openModule.default(authUrl);
            logger.info('Opening browser for authorization...');
          })
          .catch((error) => {
            logger.warn(`Failed to import 'open' package: ${error}`);
            logger.info(`Please open this URL manually: ${authUrl}`);
          });
      } catch (error) {
        logger.warn(`Failed to open browser automatically: ${error}`);
        logger.info(`Please open this URL manually: ${authUrl}`);
      }

      // Create readline interface for manual code input
      const rl = this.createReadlineInterface();

      // Prompt for authorization code
      const authCode = await new Promise<string>((resolve) => {
        rl.question(
          '\nAfter authorizing, please enter the authorization code shown by Google: ',
          (code) => {
            resolve(code.trim());
          }
        );
      });

      // Close readline interface
      rl.close();

      if (!authCode) {
        throw new Error('No authorization code provided');
      }

      // Exchange code for tokens
      const result = await this.oauthHandler.exchangeCodeForTokens(authCode, state);
      if (!result.success) {
        throw new Error(result.message);
      }

      logger.info('Manual authentication successful');

      // Get tokens from token manager
      const { accessToken, refreshToken } = tokenManager.getTokens(userId);

      if (!accessToken) {
        throw new Error('Failed to obtain access token');
      }

      // Set credentials
      const credentials: any = {
        access_token: accessToken,
      };

      if (refreshToken) {
        credentials.refresh_token = refreshToken;
        logger.info('Using stored refresh token for authentication');
      } else {
        logger.warn('No refresh token available, proceeding with access token only');
      }

      this.oauth2Client.setCredentials(credentials);
      return this.oauth2Client;
    } catch (error) {
      logger.error(`Error in manual authentication: ${error}`);
      throw error;
    }
  }

  // Start authentication flow
  public initiateAuthorization(): Promise<OAuth2Client> {
    const userId = 'default-user';

    // Create a new promise for this authorization request
    return new Promise<OAuth2Client>((resolve, reject) => {
      // If there's an existing session, cancel it and shutdown server
      const previousSession = this.currentSession;

      // Create a new session
      const session = new AuthSession();
      this.currentSession = session;

      // Add this promise's callbacks to the new session
      session.addCallback({ resolve, reject });

      // Cancel previous session and shutdown server, then start new auth flow
      const startAuthFlow = async () => {
        if (previousSession) {
          logger.info('Cancelling previous authentication session');
          previousSession.cancel();
          await this.shutdownServer();
        }

        // Check if manual authentication is enabled
        if (config.auth.useManualAuth) {
          logger.info('Using manual authentication flow');
          this.handleManualAuth(userId)
            .then((client) => {
              if (!session.isCancelled) {
                session.resolveAll(client);
                this.currentSession = null;
              }
            })
            .catch((error) => {
              if (!session.isCancelled) {
                const authError = error instanceof Error ? error : new Error(String(error));
                session.rejectAll(authError);
                this.currentSession = null;
              }
            });
          return;
        }

        // Regular authentication flow with local server
        // Ensure the server is running before starting the authentication flow
        this.startServer();

        try {
          // Generate authentication URL using OAuthHandler
          const redirectUri = `http://${config.auth.host}:${config.auth.port}/auth-success`;
          const authUrl = this.oauthHandler.generateAuthUrl(userId, redirectUri);

          logger.info(`Please authorize this app by visiting this URL: ${authUrl}`);

          // Open authentication URL in browser
          try {
            // Use dynamic import for the 'open' package (ESM module)
            // This is necessary because 'open' v10+ is ESM-only and doesn't support CommonJS require()
            import('open')
              .then((openModule) => {
                openModule.default(authUrl);
                logger.info('Opening browser for authorization...');
              })
              .catch((error) => {
                logger.warn(`Failed to import 'open' package: ${error}`);
                logger.info(`Please open this URL manually: ${authUrl}`);
              });
          } catch (error) {
            logger.warn(`Failed to open browser automatically: ${error}`);
            logger.info(`Please open this URL manually: ${authUrl}`);
          }

          // Authentication success page route
          this.expressApp.get('/auth-success', (req, res) => {
            const acceptLang = req.headers['accept-language'] || '';
            const isJapanese = acceptLang.includes('ja');
            if (isJapanese) {
              res.send(
                `<html lang="ja"><body><h3>認証が成功しました。このウィンドウを閉じて、作業を続けてください。</h3></body></html>`
              );
            } else {
              res.send(
                `<html lang="en"><body><h3>Authentication was successful. Please close this window and continue.</h3></body></html>`
              );
            }
          });

          // Monitor tokens from token manager
          const checkToken = async () => {
            // Skip if session was cancelled
            if (session.isCancelled) return;

            try {
              const { accessToken, refreshToken } = tokenManager.getTokens(userId);

              // Consider authentication successful if access token exists
              // Set refresh token only if it exists
              if (accessToken) {
                const credentials: any = {
                  access_token: accessToken,
                };

                // Add refresh token if it exists
                if (refreshToken) {
                  credentials.refresh_token = refreshToken;
                  logger.info('Using stored refresh token for authentication');
                } else {
                  logger.warn('No refresh token available, proceeding with access token only');
                }

                // Set credentials to OAuth2 client when tokens are obtained
                this.oauth2Client.setCredentials(credentials);

                // Shut down the authentication server after successful authentication
                this.shutdownServer();

                // Resolve all pending promises
                session.resolveAll(this.oauth2Client);
                this.currentSession = null;
              }
            } catch (error) {
              logger.error(`Error checking token: ${error}`);
            }
          };

          // Check tokens periodically (every 200ms)
          const intervalId = setInterval(checkToken, 200);
          session.setIntervalId(intervalId);

          // Set timeout (5 minutes)
          const timeoutId = setTimeout(
            () => {
              if (session.isCancelled) return;

              // Shut down the authentication server if authentication times out
              this.shutdownServer();

              const timeoutError = new Error('Authorization timed out after 5 minutes');
              session.rejectAll(timeoutError);
              this.currentSession = null;
            },
            5 * 60 * 1000
          );
          session.setTimeoutId(timeoutId);
        } catch (error) {
          logger.error(`Error in authorization: ${error}`);

          // Shut down the authentication server if there's an error during authentication
          this.shutdownServer();

          const authError = error instanceof Error ? error : new Error(String(error));
          session.rejectAll(authError);
          this.currentSession = null;
        }
      };

      // Start the auth flow
      startAuthFlow();
    });
  }
}

export default new OAuthAuth();
