# Google Calendar MCP Server

---

**This repository is a fork and enhancement of [takumi0706/google-calendar-mcp](https://github.com/takumi0706/google-calendar-mcp) v1.0.6. Special thanks to the original author.**

**Main difference: This version saves the acquired Google authentication token to a local file, so you do not need to authenticate every time you use it.**

**Please pay close attention to security. Manage your tokens and encryption keys strictly and never allow them to leak to third parties.**

---

## Project Overview

Google Calendar MCP Server is an MCP (Model Context Protocol) server implementation that enables integration between Google Calendar and Claude Desktop. This project enables Claude to interact with the user's Google Calendar, providing the ability to display, create, update, and delete calendar events through natural language interaction.

### Core Features

- **Google Calendar integration**: Provides a bridge between Claude Desktop and the Google Calendar API
- **MCP implementation**: Follows the Model Context Protocol specification for AI assistant tool integration
- **OAuth2 authentication**: Handles the Google API authentication flow securely
- **Event management**: Supports comprehensive calendar event operations (get, create, update, delete)
- **Color support**: Ability to set and update event colors using colorId parameter
- **STDIO transport**: Uses standard input/output for communication with Claude Desktop

## Technical Architecture

This project uses:

- **TypeScript**: For type-safe code development
- **MCP SDK**: Uses `@modelcontextprotocol/sdk` for integration with Claude Desktop
- **Google API**: Uses `googleapis` for Google Calendar API access
- **Zod**: Implements schema validation for request/response data
- **Environment-based configuration**: Uses dotenv for configuration management
- **Helmet.js**: For security headers
- **AES-256-GCM**: For token encryption
- **Jest**: For unit testing and coverage
- **GitHub Actions**: For CI/CD

## Main Components

1. **MCP Server**: Core server implementation that handles communication with Claude Desktop
2. **Google Calendar Tools**: Calendar operations (retrieval, creation, update, deletion)
3. **Authentication Handler**: Management of OAuth2 flow with Google API
4. **Schema Validation**: Ensuring data integrity in all operations
5. **Token Manager**: Secure handling of authentication tokens

## Available Tools

This MCP server provides the following tools for interacting with Google Calendar:

### 1. getEvents

Retrieves calendar events with various filtering options.

**Parameters:**

- `calendarId` (optional): Calendar ID (uses primary calendar if omitted)
- `timeMin` (optional): Start time for event retrieval (ISO 8601 format, e.g., "2025-03-01T00:00:00Z")
- `timeMax` (optional): End time for event retrieval (ISO 8601 format)
- `maxResults` (optional): Maximum number of events to retrieve (default: 10)
- `orderBy` (optional): Sort order ("startTime" or "updated")

### 2. createEvent

Creates a new calendar event.

**Parameters:**

- `calendarId` (optional): Calendar ID (uses primary calendar if omitted)
- `event`: Event details object containing:
  - `summary` (required): Event title
  - `description` (optional): Event description
  - `location` (optional): Event location
  - `start`: Start time object with:
    - `dateTime` (optional): ISO 8601 format (e.g., "2025-03-15T09:00:00+09:00")
    - `date` (optional): YYYY-MM-DD format for all-day events
    - `timeZone` (optional): Time zone (e.g., "Asia/Tokyo")
  - `end`: End time object (same format as start)
  - `attendees` (optional): Array of attendees with email and optional displayName
  - `colorId` (optional): Event color ID (1-11)
  - `recurrence` (optional): Array of recurrence rules in RFC5545 format (e.g., ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"])

### 3. updateEvent

Updates an existing calendar event. The function fetches the existing event data first and merges it with the update data, preserving fields that are not included in the update request.

**Parameters:**

- `calendarId` (optional): Calendar ID (uses primary calendar if omitted)
- `eventId` (required): ID of the event to update
- `event`: Event details object containing fields to update (same structure as createEvent, all fields optional)
  - Only fields that are explicitly provided will be updated
  - Fields not included in the update request will retain their existing values
  - This allows for partial updates without losing data
  - `recurrence` parameter can be updated to modify recurring event patterns

### 4. deleteEvent

Deletes a calendar event.

**Parameters:**

- `calendarId` (optional): Calendar ID (uses primary calendar if omitted)
- `eventId` (required): ID of the event to delete

### 5. authenticate

Re-authenticates with Google Calendar. This is useful when you want to switch between different Google accounts without having to restart Claude.

**Parameters:**

- `force` (optional): Set to true to force re-authentication (useful when switching Google accounts)

## Development Guidelines

When adding new functions, modifying code, or fixing bugs, please semantically increase the version for each change using `npm version` command.
Also, please make sure that your coding is clear and follows all the necessary coding rules, such as OOP.
You should build, run lint, and test your code before submitting it.

### Code Structure

- **src/**: Source code directory
  - **auth/**: Authentication handling
  - **config/**: Configuration settings
  - **mcp/**: MCP server implementation and tool definitions
  - **calendar/**: Google Calendar API wrapper and types
  - **utils/**: Utility functions and helpers

### Best Practices

- Proper typing according to TypeScript best practices
- Maintaining comprehensive error handling
- Ensure proper authentication flow
- Keep dependencies up to date
- Write clear documentation for all functions
- Implement security best practices
- Follow the OAuth 2.1 authentication standards
- Use schema validation for all input/output data

### Testing

- Implement unit tests for core functionality
- Thoroughly test authentication flow
- Verify calendar manipulation against Google API
- Run tests with coverage reports
- Ensure security tests are included

## Deployment

This package is published on npm as `@naotaka/google-calendar-mcp`:

```bash
npx @naotaka/google-calendar-mcp@latest
```

### Prerequisites

1. Create a Google Cloud Project and enable the Google Calendar API
2. Configure OAuth2 credentials in the Google Cloud Console
3. Set up environment variables:

```bash
# Create a .env file with your Google OAuth credentials
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4153/oauth2callback

# Optional: Auth server port and host (default port: 4153, host: localhost)
AUTH_PORT=4153
AUTH_HOST=localhost
# Optional: MCP server port and host (default port: 3000, host: localhost)
PORT=3000
HOST=localhost
# Optional: Enable manual authentication (useful when localhost is not accessible)
# USE_MANUAL_AUTH=true
# Optional: Token encryption key (auto-generated if not set)
# TOKEN_ENCRYPTION_KEY=your_64_character_hex_string
```

### Claude Desktop Configuration

Add the server to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": [
        "-y",
        "@naotaka/google-calendar-mcp@latest"
      ],
      "env": {
        "GOOGLE_CLIENT_ID": "your_client_id",
        "GOOGLE_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_REDIRECT_URI": "http://localhost:4153/oauth2callback"
      }
    }
  }
}
```

**Authentication persistence**: The server automatically generates an encryption key on first run and saves it to `~/.google-calendar-mcp/encryption-key.txt`. This allows your authentication to persist across Claude Desktop restarts without any additional configuration.

**Optional settings**:

- If you're running in an environment where localhost is not accessible (e.g., remote server or container), add `"USE_MANUAL_AUTH": "true"` to enable manual code entry
- You can customize the authentication server port with `"AUTH_PORT": "4153"` (default is 4153)
- For shared environments, you can optionally set `"TOKEN_ENCRYPTION_KEY"` to control the encryption key used

## Security Considerations

- **OAuth tokens** are encrypted with AES-256-GCM and persisted to `~/.google-calendar-mcp/tokens.json`
- **Encryption key** is auto-generated and saved to `~/.google-calendar-mcp/encryption-key.txt` with 0600 permissions
- **File permissions** should be restricted (recommend `chmod 600 ~/.google-calendar-mcp/*`)
- **Sensitive credentials** must be provided as environment variables
- **PKCE implementation** with explicit code_verifier and code_challenge generation
- **State parameter validation** for CSRF protection
- **Security headers** applied using Helmet.js
- **Rate limiting** for API endpoint protection
- **Input validation** with Zod schema
- If using `TOKEN_ENCRYPTION_KEY` env var, keep it secret and never commit to version control

For more details, see [SECURITY.md](SECURITY.md).

## Maintenance

- Regular updates to maintain compatibility with the Google Calendar API
- Version updates are documented in README.md
- Logs are output to stderr (not to files) to avoid interfering with JSON-RPC communication on stdout

## Troubleshooting

If you encounter any issues:

1. Check the stderr output for log messages (logs are not written to files)
2. Make sure your Google OAuth credentials are correctly configured
3. Ensure you have sufficient permissions for Google Calendar API access
4. Verify your Claude Desktop configuration is correct

### Common Errors

- **Re-authentication required on every restart**: This usually means the encryption key file (`~/.google-calendar-mcp/encryption-key.txt`) was deleted. The key is automatically generated on first run, but if deleted, tokens will become unreadable and re-authentication will be required.
- **JSON Parsing Errors**: If you see errors like `Unexpected non-whitespace character after JSON at position 4 (line 1 column 5)`, it's typically due to malformed JSON-RPC messages. This issue has been fixed in version 0.6.7 and later. If you're still experiencing these errors, please update to the latest version.
- **Authentication Errors**: Verify your Google OAuth credentials
- **Invalid state parameter**: If you see `Authentication failed: Invalid state parameter` when re-authenticating, update to version 1.0.3 or later which fixes the OAuth server lifecycle management. In older versions, you may need to close port 4153 and restart the application.
- **Connection Errors**: Make sure only one instance of the server is running
- **Disconnection Issues**: Ensure your server is properly handling MCP messages without custom TCP sockets
- **Cannot access localhost**: If you're running the application in an environment where localhost is not accessible (like a remote server or container), enable manual authentication by setting `USE_MANUAL_AUTH=true`. This will allow you to manually enter the authorization code shown by Google after authorizing the application.

## Development

To contribute to this project:

```bash

# Clone the repository
git clone https://github.com/naotaka3/google-calendar-mcp.git
cd google-calendar-mcp

# Install dependencies
npm install

# Run in development mode
npm run dev
```

## Testing

To run the tests:

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage
```

## License

MIT
