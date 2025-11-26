# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Google Calendar MCP Server is an MCP (Model Context Protocol) implementation that enables Claude Desktop to interact with Google Calendar through natural language. The server uses OAuth2 authentication and provides tools for managing calendar events (get, create, update, delete).

## Code Style

- All code comments, JSDoc, and documentation must be written in English
- Variable names, function names, and other identifiers should use English

## Development Commands

### Building and Running
```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run in development mode (uses ts-node, no build required)
npm run dev

# Run production build
npm start
```

### Testing
```bash
# Run all tests
npm test

# Run tests with coverage
npm test:coverage

# Run specific test file
npm test -- path/to/test.test.ts
```

### Code Quality
```bash
# Run ESLint
npm run lint

# Format code with Prettier
npm run format

# Run security audit
npm run security
```

### Version Management
When making changes, use semantic versioning:
```bash
# This runs format, adds changes, and runs npm install --legacy-peer-deps
npm version patch|minor|major
```

## Architecture

### Core Flow
1. **Entry Point (src/index.ts)**: Initializes OAuth authentication, then starts MCP server with STDIO transport
2. **Authentication (src/auth/)**: OAuth2 flow with on-demand server startup/shutdown
3. **MCP Server (src/mcp/server.ts)**: Registers tools, resources, and prompts via STDIO transport
4. **Tools Execution (src/mcp/tools.ts)**: Validates parameters with Zod, calls Calendar API
5. **Calendar API (src/calendar/calendar-api.ts)**: Google Calendar API wrapper using googleapis

### Key Architectural Patterns

**Authentication Flow**:
- OAuth server starts on-demand when authentication is needed (port 4153 by default)
- After successful authentication, server shuts down to free the port
- Supports two modes: automatic (opens browser) and manual (user enters code)
- Token refresh handled automatically; re-authentication initiated if refresh token unavailable
- Tokens stored in-memory via TokenManager with AES-256-GCM encryption

**MCP Communication**:
- Uses STDIO transport (stdin/stdout) to communicate with Claude Desktop
- Custom JSON-RPC message parser handles malformed messages (src/utils/json-parser.ts)
- Message logging intercepts both incoming and outgoing messages for debugging
- All messages are cloned/sanitized before sending to prevent formatting issues

**Tool Registration Pattern**:
- Tools defined in ToolsManager (src/mcp/tools.ts) as singleton
- Each tool has Zod schema for validation and async handler
- Tools registered with MCP server during initialization
- Errors caught and returned as structured responses with `isError: true`

**updateEvent Merge Strategy**:
- Fetches existing event data first via `getEvent()`
- Merges update params with existing data to preserve unspecified fields
- Allows partial updates without data loss

### Directory Structure
```
src/
├── auth/               # OAuth2 authentication
│   ├── oauth-auth.ts   # Main auth class, manages OAuth flow
│   ├── oauth-handler.ts # PKCE flow, state validation, token exchange
│   └── token-manager.ts # Encrypted token storage (memory + file persistence)
├── calendar/           # Google Calendar API wrapper
│   ├── calendar-api.ts # API methods (getEvents, createEvent, etc.)
│   └── types.ts        # TypeScript types for calendar operations
├── config/             # Configuration management
│   └── config.ts       # Env vars, scopes, server/auth ports
├── mcp/                # MCP server implementation
│   ├── server.ts       # MCP server setup, transport, handlers
│   ├── tools.ts        # Tool registration and execution logic
│   └── schemas.ts      # Zod schemas for request validation
├── utils/              # Shared utilities
│   ├── error-handler.ts # Error handling utilities
│   ├── html-sanitizer.ts # HTML sanitization for event descriptions
│   ├── json-parser.ts  # Robust JSON-RPC message parser
│   └── logger.ts       # File-based logging (~/.google-calendar-mcp/logs/)
└── __tests__/          # Jest test files
```

### Important Implementation Details

**OAuth Server Lifecycle**:
- Server starts in `initiateAuthorization()` and stops after auth completion or timeout
- If port 4153 is in use, assumes existing server is running and continues
- `/auth-success` route displays success message to user
- Token polling checks every 1 second with 5-minute timeout

**Manual Authentication Mode**:
- Enabled via `USE_MANUAL_AUTH=true` environment variable
- Useful for remote servers or containers where localhost isn't accessible
- Opens browser automatically, but prompts for manual code entry via readline
- Generates auth URL with `code_challenge` for PKCE flow

**Message Processing**:
- `setupMessageLogging()` wraps transport's send/onmessage methods
- Standard JSON.parse attempted first, falls back to robust parser
- All messages cloned via JSON.parse/stringify to ensure plain objects
- Errors in logging don't affect main message flow

**Calendar API Initialization**:
- `initCalendarClient()` lazy-loads calendar client on first API call
- Reuses client instance across all API calls
- Calls `oauthAuth.getAuthenticatedClient()` which handles token refresh

**Token Persistence and Encryption**:
- Tokens are persisted to `~/.google-calendar-mcp/tokens.json` for reuse across restarts
- AES-256-GCM encryption for all stored tokens (both in-memory and on disk)
- Encryption key is automatically generated on first run and saved to `~/.google-calendar-mcp/encryption-key.txt`
- Encryption key is loaded from file on subsequent runs, ensuring tokens remain accessible across restarts
- `TOKEN_ENCRYPTION_KEY` env var can optionally override the file-based key (useful for shared environments)
- Both access tokens and refresh tokens are encrypted and stored
- Tokens loaded automatically on startup from the tokens file
- Tokens stored with expiry time, automatically cleared when expired
- Cleanup task runs every hour to remove expired tokens

## Environment Variables

Required:
- `GOOGLE_CLIENT_ID`: OAuth2 client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET`: OAuth2 client secret
- `GOOGLE_REDIRECT_URI`: Usually `http://localhost:4153/oauth2callback`

Optional:
- `TOKEN_ENCRYPTION_KEY`: 32-byte hex key (64 hex characters) for token encryption
  - If not set, automatically generated and saved to `~/.google-calendar-mcp/encryption-key.txt`
  - Useful for shared environments where you want to control the encryption key
- `AUTH_PORT`: OAuth server port (default: 4153)
- `AUTH_HOST`: OAuth server host (default: localhost)
- `PORT`: MCP server port (default: 3000, unused with STDIO)
- `HOST`: MCP server host (default: localhost, unused with STDIO)
- `USE_MANUAL_AUTH`: Set to "true" for manual code entry auth flow

## Testing Considerations

- Tests use Jest with ts-jest preset
- `dotenv/config` loaded in setupFiles for environment variables
- Mock Google OAuth and Calendar API for unit tests
- Test timeout set to 30 seconds for async operations
- Coverage excludes `*.d.ts` files and `__tests__` directories

## Security Notes

- OAuth tokens encrypted with AES-256-GCM and persisted to `~/.google-calendar-mcp/tokens.json`
- Encryption key auto-generated and saved to `~/.google-calendar-mcp/encryption-key.txt` with 0600 permissions
- Token and encryption key file permissions should be restricted (recommend `chmod 600 ~/.google-calendar-mcp/*`)
- PKCE flow with code_verifier and code_challenge for authorization
- State parameter validation for CSRF protection
- Helmet.js security headers on OAuth server
- Rate limiting on OAuth endpoints (via express-rate-limit)
- Input validation with Zod schemas on all tool parameters
- If using `TOKEN_ENCRYPTION_KEY` env var, keep it secret and never commit to version control

## Common Gotchas

1. **Token persistence works automatically**: Encryption key is auto-generated and saved to `~/.google-calendar-mcp/encryption-key.txt` on first run. If this file is deleted, tokens will become unreadable and re-authentication will be required.

2. **Port 4153 conflicts**: OAuth server starts on-demand. If re-authenticating fails with "Invalid state parameter", ensure no other process is using port 4153.

3. **Refresh token unavailable**: If refresh token is missing, full re-authentication is triggered. This is expected behavior when `prompt: 'consent'` isn't used or on first auth.

4. **Module resolution**: Uses NodeNext module resolution with ESM. The 'open' package is ESM-only and must be dynamically imported.

5. **STDIO vs HTTP**: MCP server uses STDIO transport, not HTTP. PORT and HOST env vars are largely unused except for OAuth callback server.

6. **Version script behavior**: `npm version` automatically runs `npm install --legacy-peer-deps` after version bump. This is intentional due to peer dependency conflicts.

## Recurrence Events

- Use RFC5545 format for recurrence rules
- Examples:
  - Daily for 5 days: `["RRULE:FREQ=DAILY;COUNT=5"]`
  - Weekly on Mon/Wed/Fri until date: `["RRULE:FREQ=WEEKLY;UNTIL=20250515T000000Z;BYDAY=MO,WE,FR"]`
- Applied to both `createEvent` and `updateEvent` tools
