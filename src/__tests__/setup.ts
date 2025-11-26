// Jest global environment setup
process.env.NODE_ENV = 'test';

// Set environment variables before test execution
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/oauth2callback';

// Indicate that this file is not a test
export default {};