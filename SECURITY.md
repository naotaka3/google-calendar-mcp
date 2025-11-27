# Security Policy

## Reporting a Vulnerability

We take the security of Google Calendar MCP seriously. If you believe you've found a security vulnerability, please follow these steps:

1. **Do not disclose the vulnerability publicly**
2. **Report via GitHub Security Advisories**:
   - Go to the [Security tab](https://github.com/naotaka3/google-calendar-mcp/security) of this repository
   - Click "Report a vulnerability"
   - Fill out the private vulnerability report form
3. Include the following information in your report:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggestions for mitigation (if any)

You can also report directly at:
<https://github.com/naotaka3/google-calendar-mcp/security/advisories/new>

## What to Expect

- We will acknowledge receipt of your vulnerability report within 48 hours
- We will provide a more detailed response within 7 days, indicating next steps
- We will work with you to understand and address the issue
- We will keep you informed about our progress

## Security Mechanisms

The Google Calendar MCP handles OAuth tokens and calendar data, which may contain sensitive information. We've implemented the following security measures:

### Security Features in Current Version

1. **Token Encryption and Persistent Storage**:
   - AES-256-GCM encryption for protecting both access tokens and refresh tokens
   - Automatic encryption key generation and secure storage at `~/.google-calendar-mcp/encryption-key.txt`
   - Encrypted tokens persisted to `~/.google-calendar-mcp/tokens.json` for reuse across restarts
   - File permissions set to 0600 (owner read/write only) for sensitive files
   - Optional `TOKEN_ENCRYPTION_KEY` environment variable for shared environments
   - Automatic token cleanup (expired tokens removed hourly)
   - Token expiry validation before use
   - Separate expiration tracking for access tokens and refresh tokens
   - Automatic migration from legacy token format

2. **Enhanced OAuth Authentication Flow**:
   - Implementation of PKCE (Proof Key for Code Exchange) for authorization code flow
   - State parameter validation for CSRF protection
   - Support for both automatic and manual authentication modes
   - On-demand OAuth server startup/shutdown (port 4153 by default)
   - Automatic token refresh with re-authentication fallback
   - `prompt: 'consent'` parameter to ensure refresh token availability
   - Seamless token refresh when access token expires but refresh token is available
   - Multiple concurrent authentication session support (v0.0.3+)
   - Automatic cancellation of previous sessions when new authentication is initiated
   - Proper cleanup of authentication state between sessions

3. **Security Headers and Middleware**:
   - Secure HTTP headers setup using Helmet.js
   - Content Security Policy (CSP) implementation
   - Rate limiting to prevent brute force attacks on OAuth endpoints
   - XSS protection through HTML sanitization

4. **Input Validation and Sanitization**:
   - Strict schema validation using Zod for all tool parameters
   - Validation of RFC5545 RRULE format for recurring events
   - HTML sanitization using escapeHtml utility to prevent XSS attacks
   - Rigorous format checking for dates, times, email addresses, etc.
   - Length limitations and sanitization processing

5. **Secure Communication**:
   - STDIO transport for MCP communication (no network exposure)
   - Custom JSON-RPC message parser with malformed message handling
   - Message cloning/sanitization before sending to prevent formatting issues
   - Local-only OAuth server operation

6. **Error Handling and Logging**:
   - Comprehensive error handling with structured error responses
   - File-based logging at `~/.google-calendar-mcp/logs/` for security auditing
   - Sanitized error messages to prevent information leakage
   - No sensitive data logged in error messages

## Best Practices for Users

To ensure secure usage of Google Calendar MCP:

1. **Protect sensitive files and environment variables**:
   - Keep your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` secure
   - Do not commit environment variables or `.env` files to public repositories
   - Set file permissions for sensitive files: `chmod 600 ~/.google-calendar-mcp/*`
   - If using `TOKEN_ENCRYPTION_KEY` env var, never commit it to version control

2. **Keep the software updated**:
   - Always use the latest version of the package
   - Monitor security announcements in the GitHub repository
   - Regularly run `npm audit` to check for vulnerable dependencies

3. **Monitor OAuth activities**:
   - Regularly review your Google Cloud Console for any suspicious activities
   - Check the list of authorized applications in your Google Account settings
   - Revoke access immediately if you suspect any unauthorized usage

4. **Minimize OAuth scopes**:
   - Only grant the minimum required scopes for your use case
   - Review the scopes requested by the application before authorizing

5. **Secure your environment**:
   - Run the application in a secure environment with limited access
   - Use firewall rules to restrict network access if needed
   - Regularly review log files at `~/.google-calendar-mcp/logs/` for suspicious activity

6. **Handle encryption keys properly**:
   - Protect `~/.google-calendar-mcp/encryption-key.txt` from unauthorized access
   - If this file is lost or compromised, re-authenticate immediately
   - Back up the encryption key securely if needed for recovery purposes

7. **When extending the application**:
   - Always sanitize user input before including it in HTML responses
   - Use the escapeHtml utility function for any user-controlled data
   - Follow secure coding practices and perform security reviews

## Details of Security Measures

### 1. Token Encryption and Storage

Both access tokens and refresh tokens are protected using AES-256-GCM encryption:

- **Encryption algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Unique initialization vector (IV)**: Generated for each token encryption
- **Authentication tag**: Ensures integrity verification
- **Encryption key management**:
  - Auto-generated 32-byte key on first run if not provided
  - Stored at `~/.google-calendar-mcp/encryption-key.txt` with 0600 permissions
  - Can be overridden with `TOKEN_ENCRYPTION_KEY` environment variable (64 hex characters)
- **Persistent storage**: Encrypted tokens saved to `~/.google-calendar-mcp/tokens.json`
- **Token lifecycle**: Automatic expiry check and cleanup (hourly task)

### 2. OAuth 2.0 Authentication Flow

Implementation of OAuth 2.0 best practices:

- **State parameter**: Unique random string for CSRF attack prevention
- **PKCE (Proof Key for Code Exchange)**:
  - Code verifier and code challenge for authorization flow
  - Protects against code interception attacks
- **Strict validation**:
  - State parameter verification during callback
  - Token response validation
  - Authentication timeout (5 minutes)
- **Consent enforcement**: `prompt: 'consent'` parameter to ensure refresh token issuance
- **On-demand server**: OAuth server starts only when needed and shuts down after authentication
- **Session management** (v0.0.3+):
  - AuthSession class manages individual authentication sessions
  - Automatic cancellation of previous sessions when new authentication starts
  - Proper cleanup of timers and callbacks when sessions are cancelled
  - Prevention of authentication state conflicts between concurrent requests

### 3. HTML Sanitization and XSS Protection

Protection against cross-site scripting (XSS) attacks:

- **escapeHtml utility function**: Escapes HTML special characters (&, <, >, ", ')
- **Sanitization scope**: All user-controlled data in HTML responses
- **OAuth error handling**: Secure handling to prevent reflected XSS
- **Comprehensive test coverage**: Test suite for various sanitization scenarios

### 4. Rate Limiting and Protection

Protection against denial of service and brute force attacks:

- **Helmet.js security headers**:
  - Content Security Policy (CSP)
  - X-Frame-Options
  - X-Content-Type-Options
  - Strict-Transport-Security
- **Rate limiting**:
  - Applied to OAuth authentication endpoints
  - Configurable limits via express-rate-limit
- **Temporary blocking**: Gradual back-off for repeated violations

### 5. Input Validation

Comprehensive input validation using Zod schemas:

- **Tool parameters**: All MCP tool parameters validated before execution
- **Date/time validation**: ISO 8601 format enforcement
- **Email validation**: RFC 5322 compliant email address checking
- **Recurrence rules**: RFC5545 RRULE format validation
- **Length limits**: Prevention of buffer overflow and resource exhaustion
- **Type safety**: TypeScript + Zod for compile-time and runtime type checking

## Known Limitations

While we've implemented comprehensive security measures, please be aware of these limitations:

1. **Local storage security**: Token files are protected by file system permissions. Ensure your system's file system security is properly configured.

2. **OAuth server port**: The OAuth callback server uses port 4153 by default. If another process uses this port, authentication may fail.

3. **Token persistence**: If the encryption key file is lost or deleted, stored tokens become unreadable and re-authentication is required.

4. **Scope limitations**: The application requests calendar.events scope. Users should review and understand the permissions granted.

5. **Network security**: OAuth authentication requires internet connectivity. Ensure your network connection is secure during authentication.

## Disclosure Policy

We follow responsible disclosure practices:

- Security vulnerabilities are kept confidential until a fix is released
- We aim to release security patches within 30 days of confirmed vulnerabilities
- Critical vulnerabilities will be addressed with higher priority
- Public disclosure will only occur after a fix is available

## Security Updates

Security updates will be announced through:

- GitHub repository releases
- npm package updates
- Release notes documentation

Thank you for helping keep Google Calendar MCP and its users safe!
