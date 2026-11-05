window.__ModuleLoader__.load({
  id: '@local/google-docs',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // Styles for the configuration panel
    const styles = {
      container: {
        padding: '16px',
        fontFamily: 'var(--dsw-alias-font-family, system-ui, sans-serif)',
        color: 'var(--dsw-alias-text-primary, #1a1a1a)'
      },
      title: {
        fontSize: '16px',
        fontWeight: '600',
        marginBottom: '12px',
        color: 'var(--dsw-alias-text-primary, #1a1a1a)'
      },
      description: {
        fontSize: '13px',
        color: 'var(--dsw-alias-text-secondary, #666)',
        marginBottom: '16px',
        lineHeight: '1.5'
      },
      formGroup: {
        marginBottom: '12px'
      },
      label: {
        display: 'block',
        fontSize: '13px',
        fontWeight: '500',
        marginBottom: '4px',
        color: 'var(--dsw-alias-text-primary, #1a1a1a)'
      },
      input: {
        width: '100%',
        padding: '8px 10px',
        fontSize: '13px',
        border: '1px solid var(--dsw-alias-border-default, #ddd)',
        borderRadius: '4px',
        backgroundColor: 'var(--dsw-alias-surface-primary, #fff)',
        color: 'var(--dsw-alias-text-primary, #1a1a1a)',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s ease'
      },
      helpText: {
        fontSize: '11px',
        color: 'var(--dsw-alias-text-tertiary, #999)',
        marginTop: '3px'
      },
      buttonRow: {
        display: 'flex',
        gap: '8px',
        marginTop: '16px',
        alignItems: 'center',
        flexWrap: 'wrap'
      },
      button: {
        padding: '8px 16px',
        fontSize: '13px',
        fontWeight: '500',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      },
      primaryButton: {
        backgroundColor: 'var(--dsw-alias-accent-primary, #247bbf)',
        color: '#fff'
      },
      secondaryButton: {
        backgroundColor: 'transparent',
        border: '1px solid var(--dsw-alias-border-default, #ddd)',
        color: 'var(--dsw-alias-text-primary, #1a1a1a)'
      },
      statusBox: {
        marginTop: '12px',
        padding: '10px',
        borderRadius: '4px',
        fontSize: '13px'
      },
      statusSuccess: {
        backgroundColor: 'var(--dsw-alias-success-bg, #e6f9e6)',
        color: 'var(--dsw-alias-success-text, #1a7a1a)',
        border: '1px solid var(--dsw-alias-success-border, #b3e6b3)'
      },
      statusError: {
        backgroundColor: 'var(--dsw-alias-error-bg, #ffe6e6)',
        color: 'var(--dsw-alias-error-text, #cc0000)',
        border: '1px solid var(--dsw-alias-error-border, #ffcccc)'
      },
      statusInfo: {
        backgroundColor: 'var(--dsw-alias-info-bg, #e6f2ff)',
        color: 'var(--dsw-alias-info-text, #0066cc)',
        border: '1px solid var(--dsw-alias-info-border, #b3d9ff)'
      },
      link: {
        color: 'var(--dsw-alias-accent-primary, #247bbf)',
        textDecoration: 'none'
      },
      codeBlock: {
        backgroundColor: 'var(--dsw-alias-surface-secondary, #f5f5f5)',
        padding: '6px 10px',
        borderRadius: '3px',
        fontFamily: 'monospace',
        fontSize: '11px',
        marginTop: '6px',
        wordBreak: 'break-all'
      },
      statusIndicator: {
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        marginRight: '6px'
      },
      statusConnected: {
        backgroundColor: '#4caf50'
      },
      statusDisconnected: {
        backgroundColor: '#f44336'
      }
    };

    function GoogleDocsConfig(ctx) {
      const [clientId, setClientId] = React.useState('');
      const [clientSecret, setClientSecret] = React.useState('');
      const [status, setStatus] = React.useState(null);
      const [isSaving, setIsSaving] = React.useState(false);
      const [isAuthenticating, setIsAuthenticating] = React.useState(false);
      const [configStatus, setConfigStatus] = React.useState(null);

      // Load config status on mount
      React.useEffect(() => {
        loadConfigStatus();
      }, []);

      async function loadConfigStatus() {
        try {
          // Check if credentials exist by trying to describe them
          const configRef = 'google_docs_oauth_config';
          const result = await ctx.remote.credentials.describe([configRef]);
          const hasCredentials = result && result[configRef] && result[configRef].exists;
          setConfigStatus({ hasCredentials, isAuthenticated: false });
        } catch (error) {
          console.error('Failed to load config status:', error);
          setConfigStatus({ hasCredentials: false, isAuthenticated: false });
        }
      }

      const handleSave = async () => {
        if (!clientId.trim() || !clientSecret.trim()) {
          setStatus({ type: 'error', message: 'Please enter both Client ID and Client Secret' });
          return;
        }

        setIsSaving(true);
        setStatus({ type: 'info', message: 'Saving credentials...' });

        try {
          // Save credentials directly using the credentials service
          const configRef = 'google_docs_oauth_config';
          const credentialsData = JSON.stringify({
            clientId: clientId.trim(),
            clientSecret: clientSecret.trim()
          });
          
          const response = await ctx.remote.credentials.set(configRef, credentialsData);
          
          if (response.ok) {
            setStatus({ 
              type: 'success', 
              message: '✓ Credentials saved successfully! You can now authenticate with Google.'
            });
            setConfigStatus({ hasCredentials: true, isAuthenticated: false });
          } else {
            setStatus({ type: 'error', message: response.error?.message || 'Failed to save credentials' });
          }
        } catch (error) {
          setStatus({ type: 'error', message: `Failed to save credentials: ${error.message}` });
        } finally {
          setIsSaving(false);
        }
      };

      const handleAuthenticate = async () => {
        if (!clientId.trim() || !clientSecret.trim()) {
          setStatus({ type: 'error', message: 'Please save credentials first before authenticating' });
          return;
        }

        setIsAuthenticating(true);
        setStatus({ type: 'info', message: 'Preparing authentication...' });

        try {
          // Use localhost as redirect URI
          const redirectUri = 'http://localhost:8085/oauth2callback';
          const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/documents%20https://www.googleapis.com/auth/drive.readonly&access_type=offline&prompt=consent`;
          
          setStatus({
            type: 'info',
            message: '⚠️ IMPORTANT: Add this redirect URI to Google Cloud Console first:',
            redirectUri: redirectUri,
            url: authUrl,
            instructions: [
              '1. Go to Google Cloud Console > APIs & Services > Credentials',
              '2. Click your OAuth 2.0 Client ID',
              `3. Add "${redirectUri}" to "Authorized redirect URIs"`,
              '4. Save changes',
              '5. Then click the authorization link below',
              '6. After authorizing, copy the code from the URL and paste it in chat using: /google-docs-complete-auth <code>'
            ]
          });
        } catch (error) {
          setStatus({ type: 'error', message: `Authentication error: ${error.message}` });
        } finally {
          setIsAuthenticating(false);
        }
      };

      const handleClear = () => {
        setClientId('');
        setClientSecret('');
        setStatus(null);
      };

      return h('div', { style: styles.container },
        h('div', { style: styles.title }, 
          configStatus?.hasCredentials && h('span', { 
            style: { ...styles.statusIndicator, ...styles.statusConnected }
          }),
          !configStatus?.hasCredentials && h('span', { 
            style: { ...styles.statusIndicator, ...styles.statusDisconnected }
          }),
          'OAuth2 Credentials'
        ),
        h('div', { style: styles.description },
          'Configure your Google OAuth2 credentials to enable reading and writing Google Docs. ',
          'Get your credentials from the ',
          h('a', { 
            href: 'https://console.cloud.google.com/apis/credentials', 
            target: '_blank', 
            rel: 'noopener noreferrer',
            style: styles.link 
          }, 'Google Cloud Console'),
          '.'
        ),

        h('div', { style: styles.formGroup },
          h('label', { style: styles.label, htmlFor: 'google-client-id' }, 'OAuth Client ID'),
          h('input', {
            id: 'google-client-id',
            type: 'text',
            value: clientId,
            onChange: (e) => setClientId(e.target.value),
            placeholder: 'Enter your Google OAuth Client ID',
            style: styles.input
          }),
          h('div', { style: styles.helpText }, 'Found in Google Cloud Console > Credentials')
        ),

        h('div', { style: styles.formGroup },
          h('label', { style: styles.label, htmlFor: 'google-client-secret' }, 'OAuth Client Secret'),
          h('input', {
            id: 'google-client-secret',
            type: 'password',
            value: clientSecret,
            onChange: (e) => setClientSecret(e.target.value),
            placeholder: 'Enter your Google OAuth Client Secret',
            style: styles.input
          }),
          h('div', { style: styles.helpText }, 'Keep this secret secure')
        ),

        h('div', { style: styles.buttonRow },
          h('button', {
            onClick: handleSave,
            disabled: isSaving,
            style: { 
              ...styles.button, 
              ...styles.primaryButton,
              opacity: isSaving ? 0.5 : 1
            }
          }, isSaving ? 'Saving...' : 'Save Credentials'),
          h('button', {
            onClick: handleAuthenticate,
            disabled: isAuthenticating || !clientId.trim() || !clientSecret.trim(),
            style: { 
              ...styles.button, 
              ...styles.primaryButton,
              opacity: (!clientId.trim() || !clientSecret.trim()) ? 0.5 : 1,
              cursor: (!clientId.trim() || !clientSecret.trim()) ? 'not-allowed' : 'pointer'
            }
          }, isAuthenticating ? 'Authenticating...' : 'Start Authentication'),
          h('button', {
            onClick: handleClear,
            style: { ...styles.button, ...styles.secondaryButton }
          }, 'Clear')
        ),

        status && h('div', { 
          style: { 
            ...styles.statusBox,
            ...(status.type === 'success' ? styles.statusSuccess : 
               status.type === 'error' ? styles.statusError : styles.statusInfo)
          }
        },
          h('div', null, status.message),
          status.toolCall && h('div', { style: { ...styles.codeBlock, marginTop: '8px', marginBottom: '8px', userSelect: 'all' } },
            status.toolCall
          ),
          status.redirectUri && h('div', { style: { ...styles.codeBlock, marginTop: '8px', marginBottom: '8px' } },
            h('strong', null, 'Redirect URI to add: '),
            h('br'),
            status.redirectUri
          ),
          status.instructions && h('ul', { style: { margin: '6px 0 0 16px', padding: 0 } },
            status.instructions.map((inst, i) => h('li', { key: i, style: { marginBottom: '3px' } }, inst))
          ),
          status.url && h('div', { style: { ...styles.codeBlock, marginTop: '8px' } },
            h('a', { 
              href: status.url, 
              target: '_blank', 
              rel: 'noopener noreferrer',
              style: styles.link 
            }, 'Click here to authorize with Google')
          )
        )
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.credentials'],
      apply(ctx) {
        // Register in the plugin detail section - appears on the plugin's detail page
        ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({
          name: 'plugins.detail.section',
          id: 'google-docs-config',
          order: 100,
          label: () => 'Configuration'
        }, () => GoogleDocsConfig(ctx)));
      }
    };
  }
});
