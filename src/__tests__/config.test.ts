// Jest type definitions are automatically available, no explicit import needed
import config from '../config/config';

// Temporarily mock environment variables
beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/oauth2callback';
});

// Restore mocks after each test
afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;
});

describe('Config', () => {
  it('should have google configuration', () => {
    expect(config.google).toBeDefined();
    expect(config.google.clientId).toBeDefined();
    expect(config.google.clientSecret).toBeDefined();
    expect(config.google.redirectUri).toBeDefined();
    expect(config.google.scopes).toBeInstanceOf(Array);
  });

  it('should have server configuration', () => {
    expect(config.server).toBeDefined();
    expect(config.server.port).toBeDefined();
    expect(typeof config.server.port).toBe('number');
    expect(config.server.host).toBeDefined();
  });
});