/**
 * GitHub OAuth Implementation
 * Primary: Device Flow (works in SSH/headless)
 * Fallback: Browser-based OAuth with local callback server
 */

import type {
  GitHubDeviceCodeResponse,
  GitHubAccessTokenResponse,
  GitHubUserResponse,
  GitHubEmailResponse,
  GitHubIdentity,
} from './types';

/**
 * GitHub OAuth App Client ID
 * This is safe to commit - it's a public identifier for the OAuth app
 * The OAuth app must be registered at github.com/settings/developers
 *
 * Note: Until the OAuth App is registered, the GitHub identity step
 * will be deferred/skipped. LLM provider setup works independently.
 */
const GITHUB_CLIENT_ID = 'Ov23liPzN7sAjwDsqUcx';

/**
 * Callback server port for browser-based OAuth fallback
 */
const CALLBACK_PORT = 19284;

/**
 * GitHub Device Flow OAuth
 * Works in SSH sessions and headless environments
 */
export class GitHubDeviceFlow {
  private clientId: string;
  private deviceCode: string | null = null;
  private interval: number = 5;
  private expiresAt: number = 0;

  constructor(clientId: string = GITHUB_CLIENT_ID) {
    this.clientId = clientId;
  }

  /**
   * Step 1: Request device code from GitHub
   * Returns the user code that must be entered at github.com/login/device
   */
  async requestDeviceCode(): Promise<GitHubDeviceCodeResponse> {
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        scope: 'read:user user:email',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to request device code: ${response.status} ${text}`);
    }

    const data = (await response.json()) as GitHubDeviceCodeResponse;

    // Store for polling
    this.deviceCode = data.device_code;
    this.interval = data.interval || 5;
    this.expiresAt = Date.now() + data.expires_in * 1000;

    return data;
  }

  /**
   * Step 2: Poll for access token
   * Call this repeatedly until it returns a token or throws an error
   */
  async pollForToken(): Promise<GitHubAccessTokenResponse> {
    if (!this.deviceCode) {
      throw new Error('Device code not requested. Call requestDeviceCode first.');
    }

    if (Date.now() > this.expiresAt) {
      throw new Error('Device code expired. Please start the login process again.');
    }

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        device_code: this.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to poll for token: ${response.status} ${text}`);
    }

    return (await response.json()) as GitHubAccessTokenResponse;
  }

  /**
   * Get the polling interval in milliseconds
   */
  getPollingInterval(): number {
    return this.interval * 1000;
  }

  /**
   * Wait for authorization by polling
   * Returns the access token when the user completes authorization
   */
  async waitForAuthorization(onPoll?: () => void, abortSignal?: AbortSignal): Promise<string> {
    for (;;) {
      if (abortSignal?.aborted) {
        throw new Error('Authorization cancelled');
      }

      const result = await this.pollForToken();

      if (result.access_token) {
        return result.access_token;
      }

      if (result.error === 'authorization_pending') {
        // User hasn't authorized yet, keep polling
        onPoll?.();
        await this.sleep(this.getPollingInterval());
        continue;
      }

      if (result.error === 'slow_down') {
        // GitHub is asking us to slow down
        this.interval += 5;
        await this.sleep(this.getPollingInterval());
        continue;
      }

      if (result.error === 'expired_token') {
        throw new Error('Device code expired. Please start the login process again.');
      }

      if (result.error === 'access_denied') {
        throw new Error('Authorization was denied by the user.');
      }

      // Unknown error
      throw new Error(result.error_description || result.error || 'Unknown authorization error');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Fetch GitHub user profile using access token
 */
export async function fetchGitHubUser(accessToken: string): Promise<GitHubUserResponse> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Nimbus-CLI',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch user profile: ${response.status} ${text}`);
  }

  return (await response.json()) as GitHubUserResponse;
}

/**
 * Fetch GitHub user's primary email
 */
export async function fetchGitHubEmail(accessToken: string): Promise<string | null> {
  const response = await fetch('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Nimbus-CLI',
    },
  });

  if (!response.ok) {
    // Email access might be restricted, return null
    return null;
  }

  const emails = (await response.json()) as GitHubEmailResponse[];
  const primaryEmail = emails.find(e => e.primary && e.verified);
  return primaryEmail?.email || emails[0]?.email || null;
}

/**
 * Complete GitHub authentication flow
 * Returns a GitHubIdentity object ready to store
 */
export async function completeGitHubAuth(accessToken: string): Promise<GitHubIdentity> {
  const [user, email] = await Promise.all([
    fetchGitHubUser(accessToken),
    fetchGitHubEmail(accessToken),
  ]);

  return {
    username: user.login,
    name: user.name,
    email: email || user.email,
    avatarUrl: user.avatar_url,
    accessToken,
    authenticatedAt: new Date().toISOString(),
  };
}

/**
 * Browser-based OAuth callback server (fallback)
 * Creates a temporary local server to receive the OAuth callback
 */
export class BrowserOAuthServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private clientId: string;
  private codePromise: Promise<string> | null = null;
  private codeResolve: ((code: string) => void) | null = null;
  private codeReject: ((error: Error) => void) | null = null;

  constructor(clientId: string = GITHUB_CLIENT_ID) {
    this.clientId = clientId;
  }

  /**
   * Start the callback server and return the authorization URL
   */
  async start(): Promise<string> {
    // Create promise for receiving the code
    this.codePromise = new Promise((resolve, reject) => {
      this.codeResolve = resolve;
      this.codeReject = reject;
    });

    // Start the server
    this.server = Bun.serve({
      port: CALLBACK_PORT,
      fetch: request => this.handleRequest(request),
    });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: `http://localhost:${CALLBACK_PORT}/callback`,
      scope: 'read:user user:email',
      state: this.generateState(),
    });

    return `https://github.com/login/oauth/authorize?${params}`;
  }

  /**
   * Wait for the authorization code
   */
  async waitForCode(timeout: number = 300000): Promise<string> {
    if (!this.codePromise) {
      throw new Error('Server not started. Call start() first.');
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Authorization timed out'));
      }, timeout);
    });

    try {
      return await Promise.race([this.codePromise, timeoutPromise]);
    } finally {
      this.stop();
    }
  }

  /**
   * Stop the callback server
   */
  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  private handleRequest(request: Request): Response {
    const url = new URL(request.url);

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (error) {
        this.codeReject?.(new Error(errorDescription || error));
        return new Response(this.getErrorPage(errorDescription || error), {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (code) {
        this.codeResolve?.(code);
        return new Response(this.getSuccessPage(), {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      return new Response('Bad request', { status: 400 });
    }

    return new Response('Not found', { status: 404 });
  }

  private generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  private getSuccessPage(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Nimbus CLI - Authorization Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
    }
    h1 { margin-bottom: 10px; }
    p { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✓ Authorization Successful</h1>
    <p>You can close this window and return to the terminal.</p>
  </div>
</body>
</html>`;
  }

  private getErrorPage(error: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Nimbus CLI - Authorization Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
    }
    h1 { margin-bottom: 10px; }
    p { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✗ Authorization Failed</h1>
    <p>${error}</p>
    <p>Please close this window and try again.</p>
  </div>
</body>
</html>`;
  }
}

/**
 * Exchange authorization code for access token (browser flow)
 * Note: This requires a client secret which should not be in CLI code
 * For true CLI-only auth, use the Device Flow instead
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string = GITHUB_CLIENT_ID,
  clientSecret?: string
): Promise<string> {
  if (!clientSecret) {
    throw new Error(
      'Browser-based OAuth requires a client secret. Use Device Flow for CLI-only auth.'
    );
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to exchange code for token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as GitHubAccessTokenResponse;

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  if (!data.access_token) {
    throw new Error('No access token in response');
  }

  return data.access_token;
}
