# Contributing to Google Calendar MCP

## Development

To set up the project for development:

```bash

# Clone the repository
git clone https://github.com/naotaka3/google-calendar-mcp.git
cd google-calendar-mcp

# Install dependencies
npm install

# Create a .env file with your Google credentials
cat > .env << EOL
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
EOL

# Run in development mode
npm run dev
```

## Testing

Run tests with:

```bash
npm test
```

## Building

Build the project with:

```bash
npm run build
```

## Code Style

We use ESLint and Prettier to maintain code quality and style:

```bash
# Lint the code
npm run lint

# Format the code
npm run format
```
