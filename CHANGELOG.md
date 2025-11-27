# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2025-11-27

### Fixed

- **Token Persistence Issues**: Fixed issues where tokens were not properly persisted or refreshed across application restarts
- **Token Refresh Logic**: Improved token refresh handling when only refresh token is available (access token expired)

## [0.0.1] - 2025-11-24

### Added

- Initial release with core functionality
- **Google Calendar Integration**: Full CRUD operations for calendar events
- **OAuth2 Authentication**: Secure authentication with PKCE flow
- **Token Encryption**: AES-256-GCM encryption for token storage
- **Token Persistence**: Tokens saved to `~/.google-calendar-mcp/tokens.json`
- **Automatic Encryption Key Generation**: Key auto-generated and saved to `~/.google-calendar-mcp/encryption-key.txt`
- **MCP Server Implementation**: STDIO transport for Claude Desktop integration
- **Event Color Support**: Ability to set and update event colors using colorId parameter
- **Recurrence Support**: RFC5545 format for recurring events
- **Manual Authentication Mode**: Support for environments where localhost is not accessible
- **Security Features**: Helmet.js headers, rate limiting, input validation with Zod

[Unreleased]: https://github.com/naotaka3/google-calendar-mcp/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/naotaka3/google-calendar-mcp/releases/tag/v0.0.1
