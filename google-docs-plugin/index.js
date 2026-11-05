/**
 * Google Docs Integration Plugin for DeepSeek Harness
 * Provides OAuth2 authentication and tools to read/write Google Docs
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DOCS_API = 'https://docs.googleapis.com/v1/documents';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.readonly'
].join(' ');

// Credential keys for storing OAuth config (must match /^[A-Za-z_][A-Za-z0-9_]*$/)
const OAUTH_CONFIG_KEY = 'google_docs_oauth_config';
const OAUTH_TOKEN_KEY = 'google_docs_oauth_token';

export const inject = ['tools', 'credentials', 'authorization', 'commands'];

export function apply(ctx) {
  // Helper to get OAuth credentials from storage or environment
  async function getOAuthConfig() {
    // First try to read from credentials storage
    const record = await ctx.credentials.readRecord(OAUTH_CONFIG_KEY);
    if (record) {
      // Handle both JSON string (from UI) and object (from tool)
      if (typeof record === 'string') {
        try {
          const parsed = JSON.parse(record);
          if (parsed.clientId && parsed.clientSecret) {
            return {
              clientId: parsed.clientId,
              clientSecret: parsed.clientSecret
            };
          }
        } catch {
          // Fall through to env vars
        }
      } else if (record.clientId && record.clientSecret) {
        return {
          clientId: record.clientId,
          clientSecret: record.clientSecret
        };
      }
    }
    
    // Fall back to environment variables
    const envClientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
    const envClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
    
    return {
      clientId: envClientId,
      clientSecret: envClientSecret
    };
  }

  // Helper to save OAuth credentials to storage
  async function saveOAuthConfig(clientId, clientSecret) {
    await ctx.credentials.modifyRecord(OAUTH_CONFIG_KEY, () => ({
      clientId,
      clientSecret
    }));
  }

  // Helper to get valid access token
  async function getAccessToken(signal) {
    const config = await getOAuthConfig();
    if (!config.clientId || !config.clientSecret) {
      throw new Error('Google OAuth credentials not configured. Please configure them in the plugin settings.');
    }

    const record = await ctx.credentials.readRecord(OAUTH_TOKEN_KEY);
    if (!record?.token) {
      throw new Error('Not authenticated with Google. Please authenticate first using the plugin UI or google_docs_auth tool.');
    }

    // Check if token is expired or about to expire
    if (record.expiresAt && Date.now() >= record.expiresAt - 60000) {
      if (!record.refreshToken) {
        throw new Error('Token expired and no refresh token available. Please re-authenticate.');
      }

      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: record.refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'refresh_token'
        }),
        signal
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token. Please re-authenticate.');
      }

      const tokens = await response.json();
      await ctx.credentials.modifyRecord(OAUTH_TOKEN_KEY, () => ({
        token: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in * 1000)
      }));
      return tokens.access_token;
    }

    return record.token;
  }

  // Register authorization flow for Google OAuth2
  const unregisterFlow = ctx.authorization.registerFlow({
    key: OAUTH_TOKEN_KEY,
    name: 'Google OAuth2',
    async begin(signal) {
      const config = await getOAuthConfig();
      if (!config.clientId || !config.clientSecret) {
        throw new Error('Google OAuth credentials not configured. Please configure them in the plugin settings first.');
      }

      // Use localhost as redirect URI - user needs to add this to their Google Cloud Console
      const redirectUri = 'http://localhost:8085/oauth2callback';
      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');

      return {
        type: 'url',
        url: authUrl.toString(),
        instructions: `IMPORTANT: Before authorizing, you must add this redirect URI to your Google Cloud Console:
        
${redirectUri}

Steps:
1. Go to Google Cloud Console > APIs & Services > Credentials
2. Click on your OAuth 2.0 Client ID
3. Add "${redirectUri}" to "Authorized redirect URIs"
4. Save changes
5. Then click the authorization URL above`
      };
    },
    async complete(code, signal) {
      const config = await getOAuthConfig();
      if (!config.clientId || !config.clientSecret) {
        throw new Error('Google OAuth credentials not configured.');
      }

      const redirectUri = 'http://localhost:8085/oauth2callback';
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }),
        signal
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${error}`);
      }

      const tokens = await response.json();
      return {
        token: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in * 1000)
      };
    }
  });

  // Register commands for UI to call
  const unregisterCommands = [];

  // Command to save OAuth config
  unregisterCommands.push(ctx.commands.register({
    definitionId: 'google-docs-save-config',
    name: 'google-docs-save-config',
    description: 'Save Google OAuth credentials',
    handler: async (args) => {
      try {
        let clientId, clientSecret;
        
        // Handle both object args (from tools) and string args (from commands)
        if (typeof args === 'string') {
          const parts = args.trim().split(/\s+/);
          if (parts.length < 2) {
            return { success: false, error: 'Usage: /google-docs-save-config <clientId> <clientSecret>' };
          }
          clientId = parts[0];
          clientSecret = parts.slice(1).join(' '); // In case secret has spaces
        } else if (typeof args === 'object') {
          clientId = args.clientId;
          clientSecret = args.clientSecret;
        } else {
          return { success: false, error: 'Invalid arguments' };
        }
        
        if (!clientId || !clientSecret) {
          return { success: false, error: 'Both clientId and clientSecret are required' };
        }
        await saveOAuthConfig(clientId, clientSecret);
        return { success: true, message: 'Credentials saved successfully' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  }));

  // Command to get OAuth config status
  unregisterCommands.push(ctx.commands.register({
    definitionId: 'google-docs-get-config',
    name: 'google-docs-get-config',
    description: 'Get Google OAuth configuration status',
    handler: async () => {
      try {
        const config = await getOAuthConfig();
        const tokenRecord = await ctx.credentials.readRecord(OAUTH_TOKEN_KEY);
        return {
          hasCredentials: !!(config.clientId && config.clientSecret),
          isAuthenticated: !!tokenRecord?.token,
          tokenExpiresAt: tokenRecord?.expiresAt
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  }));

  // Command to start OAuth flow
  unregisterCommands.push(ctx.commands.register({
    definitionId: 'google-docs-start-auth',
    name: 'google-docs-start-auth',
    description: 'Start Google OAuth authentication flow',
    handler: async (args, exec) => {
      try {
        const outcome = await ctx.authorization.begin({ key: OAUTH_TOKEN_KEY, signal: exec.signal });
        if (outcome.status === 'completed') {
          return { success: true, status: 'completed', message: 'Authentication successful!' };
        } else if (outcome.status === 'pending') {
          return { 
            success: true, 
            status: 'pending', 
            url: outcome.url,
            instructions: outcome.instructions,
            message: 'Please complete authentication in your browser'
          };
        }
        return { success: false, error: 'Authentication was cancelled or failed' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  }));

  // Command to complete OAuth flow with authorization code
  unregisterCommands.push(ctx.commands.register({
    definitionId: 'google-docs-complete-auth',
    name: 'google-docs-complete-auth',
    description: 'Complete Google OAuth authentication with authorization code',
    handler: async (args, exec) => {
      try {
        const code = args.code || args._;
        if (!code) {
          return { success: false, error: 'Authorization code is required. Usage: /google-docs-complete-auth <code>' };
        }

        const config = await getOAuthConfig();
        if (!config.clientId || !config.clientSecret) {
          return { success: false, error: 'Google OAuth credentials not configured. Please configure them first.' };
        }

        const redirectUri = 'http://localhost:8085/oauth2callback';
        const response = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: code.trim(),
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
          }),
          signal: exec.signal
        });

        if (!response.ok) {
          const error = await response.text();
          return { success: false, error: `Token exchange failed: ${error}` };
        }

        const tokens = await response.json();
        await ctx.credentials.modifyRecord(OAUTH_TOKEN_KEY, () => ({
          token: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + (tokens.expires_in * 1000)
        }));

        return { 
          success: true, 
          message: '✓ Successfully authenticated with Google! You can now use google_docs_read, google_docs_write, and google_docs_list tools.'
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  }));

  // Register tools
  const unregisterTools = [];

  // Tool: Complete OAuth authentication with code
  unregisterTools.push(ctx.tools.register({
    name: 'google_docs_complete_auth',
    description: 'Complete Google OAuth authentication using the authorization code from the redirect URL. Optionally provide clientId and clientSecret to configure credentials at the same time.',
    parameters: {
      code: {
        type: 'string',
        description: 'The authorization code from Google (the value after "code=" in the redirect URL)'
      },
      clientId: {
        type: 'string',
        description: 'Optional: Google OAuth Client ID (if not already configured)'
      },
      clientSecret: {
        type: 'string',
        description: 'Optional: Google OAuth Client Secret (if not already configured)'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', description: 'Whether authentication succeeded' },
          message: { type: 'string', description: 'Result message' },
          error: { type: 'string', description: 'Error message if failed' }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.error ? `Error: ${value.error}` : value.message
      }]
    },
    async execute(args, exec) {
      try {
        if (!args.code) {
          return { success: false, error: 'Authorization code is required' };
        }

        // Save credentials if provided
        if (args.clientId && args.clientSecret) {
          await saveOAuthConfig(args.clientId, args.clientSecret);
        }

        const config = await getOAuthConfig();
        if (!config.clientId || !config.clientSecret) {
          return { 
            success: false, 
            error: 'Google OAuth credentials not configured. Please provide clientId and clientSecret parameters, or configure them first using google_docs_save_config tool.' 
          };
        }

        const redirectUri = 'http://localhost:8085/oauth2callback';
        const response = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: args.code.trim(),
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
          }),
          signal: exec.signal
        });

        if (!response.ok) {
          const error = await response.text();
          return { success: false, error: `Token exchange failed: ${error}` };
        }

        const tokens = await response.json();
        await ctx.credentials.modifyRecord(OAUTH_TOKEN_KEY, () => ({
          token: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + (tokens.expires_in * 1000)
        }));

        return { 
          success: true, 
          message: '✓ Successfully authenticated with Google! You can now use google_docs_list, google_docs_read, and google_docs_write tools.'
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  }));

  // Tool: Save OAuth configuration
  unregisterTools.push(ctx.tools.register({
    name: 'google_docs_save_config',
    description: 'Save Google OAuth credentials (Client ID and Client Secret)',
    parameters: {
      clientId: {
        type: 'string',
        description: 'Google OAuth Client ID from Google Cloud Console'
      },
      clientSecret: {
        type: 'string',
        description: 'Google OAuth Client Secret from Google Cloud Console'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', description: 'Whether save succeeded' },
          message: { type: 'string', description: 'Result message' },
          error: { type: 'string', description: 'Error message if failed' }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.error ? `Error: ${value.error}` : value.message
      }]
    },
    async execute(args, exec) {
      try {
        if (!args.clientId || !args.clientSecret) {
          return { success: false, error: 'Both clientId and clientSecret are required' };
        }
        await saveOAuthConfig(args.clientId, args.clientSecret);
        return { 
          success: true, 
          message: '✓ Credentials saved successfully! You can now authenticate with Google using google_docs_complete_auth.'
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  }));

  // Tool: Authenticate with Google
  unregisterTools.push(ctx.tools.register({
    name: 'google_docs_auth',
    description: 'Start OAuth2 flow to authenticate with Google Docs API. This will provide a URL to open in your browser.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', description: 'Authentication status' },
          message: { type: 'string', description: 'Status message or instructions' },
          url: { type: 'string', description: 'Authorization URL (if pending)' }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.message + (value.url ? `\n\nURL: ${value.url}` : '')
      }]
    },
    async execute(args, exec) {
      try {
        const outcome = await ctx.authorization.begin({ key: OAUTH_TOKEN_KEY, signal: exec.signal });
        if (outcome.status === 'completed') {
          return {
            status: 'success',
            message: 'Successfully authenticated with Google! You can now use google_docs_read, google_docs_write, and google_docs_list tools.'
          };
        } else if (outcome.status === 'pending') {
          return {
            status: 'pending',
            message: `Please complete authentication:\n\n${outcome.instructions}`,
            url: outcome.url
          };
        }
        return {
          status: 'failed',
          message: 'Authentication was cancelled or failed.'
        };
      } catch (error) {
        return {
          status: 'error',
          message: `Authentication error: ${error.message}`
        };
      }
    }
  }));

  // Tool: Read Google Doc
  unregisterTools.push(ctx.tools.register({
    name: 'google_docs_read',
    description: 'Read the content of a Google Doc by its document ID. The document ID can be found in the URL: https://docs.google.com/document/d/[DOCUMENT_ID]/edit',
    parameters: {
      documentId: {
        type: 'string',
        description: 'The Google Doc document ID'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Document title' },
          content: { type: 'string', description: 'Document text content' },
          error: { type: 'string', description: 'Error message if failed' }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.error 
          ? `Error: ${value.error}`
          : `Document: ${value.title}\n\n${value.content}`
      }]
    },
    async execute(args, exec) {
      try {
        const accessToken = await getAccessToken(exec.signal);
        const response = await fetch(`${GOOGLE_DOCS_API}/${args.documentId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          signal: exec.signal
        });

        if (!response.ok) {
          const error = await response.text();
          return { error: `Failed to read document: ${error}` };
        }

        const doc = await response.json();
        const content = extractTextFromDoc(doc);

        return {
          title: doc.title,
          content: content
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  }));

  // Tool: Write to Google Doc
  unregisterTools.push(ctx.tools.register({
    name: 'google_docs_write',
    description: 'Update content in a Google Doc. Can append text, replace all content, or insert at a specific position.',
    parameters: {
      documentId: {
        type: 'string',
        description: 'The Google Doc document ID'
      },
      text: {
        type: 'string',
        description: 'The text content to write'
      },
      mode: {
        type: 'string',
        enum: ['append', 'replace', 'insert'],
        description: 'Write mode: append to end, replace all content, or insert at position'
      },
      position: {
        type: 'number',
        description: 'Character position for insert mode (0-based)'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', description: 'Whether the operation succeeded' },
          message: { type: 'string', description: 'Result message' },
          error: { type: 'string', description: 'Error message if failed' }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.error ? `Error: ${value.error}` : value.message
      }]
    },
    async execute(args, exec) {
      try {
        const accessToken = await getAccessToken(exec.signal);

        let requests = [];
        if (args.mode === 'replace') {
          requests = [
            { deleteContentRange: { range: { startIndex: 1, endIndex: 1 } } },
            { insertText: { location: { index: 1 }, text: args.text } }
          ];
        } else if (args.mode === 'append') {
          const docResponse = await fetch(`${GOOGLE_DOCS_API}/${args.documentId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            signal: exec.signal
          });
          const doc = await docResponse.json();
          const endIndex = doc.body.content[doc.body.content.length - 1]?.endIndex || 1;
          requests = [{ insertText: { location: { index: endIndex - 1 }, text: args.text } }];
        } else if (args.mode === 'insert') {
          const position = args.position ?? 1;
          requests = [{ insertText: { location: { index: position }, text: args.text } }];
        }

        const response = await fetch(`${GOOGLE_DOCS_API}/${args.documentId}:batchUpdate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ requests }),
          signal: exec.signal
        });

        if (!response.ok) {
          const error = await response.text();
          return { success: false, error: `Failed to write to document: ${error}` };
        }

        return {
          success: true,
          message: `Successfully updated document with mode: ${args.mode}`
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  }));

  // Tool: List Google Docs
  unregisterTools.push(ctx.tools.register({
    name: 'google_docs_list',
    description: 'List Google Docs documents in your Drive. Returns document IDs, titles, and modified dates.',
    parameters: {
      query: {
        type: 'string',
        description: 'Optional search query to filter documents'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          count: { type: 'number', description: 'Number of documents found' },
          documents: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                modifiedTime: { type: 'string' }
              }
            },
            description: 'List of documents'
          },
          error: { type: 'string', description: 'Error message if failed' }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.error
          ? `Error: ${value.error}`
          : value.count === 0
            ? 'No documents found.'
            : `Found ${value.count} document(s):\n\n${value.documents.map(d => `- ${d.name} (ID: ${d.id}, Modified: ${d.modifiedTime})`).join('\n')}`
      }]
    },
    async execute(args, exec) {
      try {
        const accessToken = await getAccessToken(exec.signal);
        const queryParams = new URLSearchParams({
          q: args.query ? `mimeType='application/vnd.google-apps.document' and ${args.query}` : "mimeType='application/vnd.google-apps.document'",
          fields: 'files(id,name,modifiedTime)',
          pageSize: String(args.maxResults ?? 10),
          orderBy: 'modifiedTime desc'
        });

        const response = await fetch(`${GOOGLE_DRIVE_API}?${queryParams}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          signal: exec.signal
        });

        if (!response.ok) {
          const error = await response.text();
          return { error: `Failed to list documents: ${error}` };
        }

        const data = await response.json();
        const files = data.files || [];

        return {
          count: files.length,
          documents: files.map(f => ({
            id: f.id,
            name: f.name,
            modifiedTime: f.modifiedTime
          }))
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  }));

  // Return cleanup function
  return () => {
    unregisterFlow();
    unregisterCommands.forEach(unregister => unregister());
    unregisterTools.forEach(unregister => unregister());
  };
}

/**
 * Extract plain text from Google Docs API response
 */
function extractTextFromDoc(doc) {
  if (!doc.body?.content) return '';

  let text = '';
  for (const element of doc.body.content) {
    if (element.paragraph) {
      for (const run of element.paragraph.elements || []) {
        if (run.textRun?.content) {
          text += run.textRun.content;
        }
      }
    }
  }
  return text.trim();
}
