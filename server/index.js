import fs from 'fs';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const JWT_SECRET = 'excalidraw_local_secret_key_change_me_in_prod';

// Auth Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// --- AUTH ROUTES ---
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  db.get('SELECT id, username, role, auth_type FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  });
});

app.put('/api/auth/password', authenticate, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 1) {
    return res.status(400).json({ error: 'New password is required' });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    // If user is OIDC-only, changing password makes them oidc_local
    db.get('SELECT auth_type FROM users WHERE id = ?', [req.user.id], (err, row) => {
      if (err || !row) return res.status(404).json({ error: 'User not found' });
      const newAuthType = row.auth_type === 'oidc' ? 'oidc_local' : row.auth_type;
      db.run(
        'UPDATE users SET password_hash = ?, auth_type = ? WHERE id = ?',
        [hash, newAuthType, req.user.id],
        function(err2) {
          if (err2) return res.status(500).json({ error: 'Failed to update password' });
          if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
          res.json({ success: true, auth_type: newAuthType });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process password change' });
  }
});

// --- PERSONAL LIBRARY API ---
app.get('/api/library', authenticate, (req, res) => {
  db.get('SELECT library_data FROM user_library WHERE user_id = ?', [req.user.id], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    if (row && row.library_data) {
      try {
        const libraryItems = JSON.parse(row.library_data);
        res.json({ libraryItems });
      } catch (e) {
        res.json({ libraryItems: [] });
      }
    } else {
      res.json({ libraryItems: [] });
    }
  });
});

app.put('/api/library', authenticate, (req, res) => {
  const { libraryItems } = req.body;
  const libraryData = JSON.stringify(libraryItems || []);
  db.run(`
    INSERT INTO user_library (user_id, library_data, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
    library_data = excluded.library_data,
    updated_at = CURRENT_TIMESTAMP
  `, [req.user.id, libraryData], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    res.json({ success: true });
  });
});

// --- ADMIN API ---USER MANAGEMENT ROUTES ---
app.get('/api/users', authenticate, requireAdmin, (req, res) => {
  db.all('SELECT id, username, role, auth_type FROM users', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch users' });
    res.json(rows);
  });
});

app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  
  if (!username || !password || !role) return res.status(400).json({ error: 'Missing fields' });
  if (role !== 'ADMIN' && role !== 'USER') return res.status(400).json({ error: 'Invalid role' });

  const hash = await bcrypt.hash(password, 10);
  
  db.run('INSERT INTO users (username, password_hash, role, auth_type) VALUES (?, ?, ?, ?)', [username, hash, role, 'local'], function(err) {
    if (err) return res.status(400).json({ error: 'Username might already exist or invalid input' });
    res.status(201).json({ id: this.lastID, username, role, auth_type: 'local' });
  });
});

app.put('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  
  if (!username || !role) return res.status(400).json({ error: 'Missing fields' });
  if (role !== 'ADMIN' && role !== 'USER') return res.status(400).json({ error: 'Invalid role' });

  try {
    // Check if modifying root admin
    db.get('SELECT username, auth_type FROM users WHERE id = ?', [req.params.id], async (err, row) => {
      if (err || !row) return res.status(400).json({ error: 'User not found' });
      
      let finalRole = role;
      if (row.username === 'admin' && role !== 'ADMIN') {
        finalRole = 'ADMIN'; // Force role to stay ADMIN for root user
      }

      if (password) {
        const hash = await bcrypt.hash(password, 10);
        // If OIDC user gets a password, upgrade to oidc_local
        const newAuthType = row.auth_type === 'oidc' ? 'oidc_local' : row.auth_type;
        db.run('UPDATE users SET username = ?, password_hash = ?, role = ?, auth_type = ? WHERE id = ?', 
          [username, hash, finalRole, newAuthType, req.params.id], function(err) {
          if (err) return res.status(400).json({ error: 'Failed to update user' });
          res.json({ success: true });
        });
      } else {
        db.run('UPDATE users SET username = ?, role = ? WHERE id = ?', 
          [username, finalRole, req.params.id], function(err) {
          if (err) return res.status(400).json({ error: 'Failed to update user' });
          res.json({ success: true });
        });
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/users/:id', authenticate, requireAdmin, (req, res) => {
  db.get('SELECT username FROM users WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(400).json({ error: 'User not found' });
    if (row.username === 'admin') return res.status(403).json({ error: 'Cannot delete the root admin account' });

    db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: 'Failed to delete user' });
      res.json({ success: true, changes: this.changes });
    });
  });
});

// --- OIDC CONFIG ROUTES ---
app.get('/api/oidc-config', authenticate, requireAdmin, (req, res) => {
  db.get('SELECT * FROM oidc_config WHERE id = 1', (err, row) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch OIDC config' });
    if (!row) return res.json({});
    // Don't send secret to frontend unless asking to test, but we send it here for editing
    res.json(row);
  });
});

app.get('/api/public-oidc-config', (req, res) => {
  db.get('SELECT enabled, provider_name FROM oidc_config WHERE id = 1', (err, row) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch public OIDC config' });
    if (!row) return res.json({ enabled: 0 });
    res.json(row);
  });
});

app.put('/api/oidc-config', authenticate, requireAdmin, (req, res) => {
  const { provider_name, client_id, client_secret, issuer_url, redirect_uri, enabled } = req.body;
  
  if (enabled && (!client_id || !client_secret || !issuer_url)) {
    return res.status(400).json({ error: 'Client ID, Secret and Issuer URL are required to enable OIDC' });
  }

  db.run(
    'UPDATE oidc_config SET provider_name = ?, client_id = ?, client_secret = ?, issuer_url = ?, redirect_uri = ?, enabled = ? WHERE id = 1',
    [provider_name, client_id, client_secret, issuer_url, redirect_uri, enabled ? 1 : 0],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to update OIDC config' });
      res.json({ success: true });
    }
  );
});

// --- OIDC FLOW ROUTES ---

// Helper function to append to a log file
function logOidc(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  const logMsg = `[${new Date().toISOString()}] ${msg}\n`;
  console.log('[OIDC]', msg);
  try {
    const logPath = path.join(__dirname, 'data', 'oidc.log');
    fs.appendFileSync(logPath, logMsg);
  } catch (e) {
    console.error('Failed to write to oidc.log:', e);
  }
}

// Helper: detect the real public URL for OIDC redirect_uri.
// Works automatically behind a reverse proxy without any extra config:
// Priority 1: X-Forwarded-Proto + X-Forwarded-Host (standard reverse proxy headers)
// Priority 2: Referer header — browser sends the page URL it came from (e.g. https://draw.abc.com/login)
// Priority 3: FRONTEND_URL env var (explicit override)
// Priority 4: Fallback to raw host from request
function getOidcRedirectUri(req) {
  logOidc('Incoming request headers for redirectURI:', JSON.stringify({
    'x-forwarded-proto': req.headers['x-forwarded-proto'],
    'x-forwarded-host': req.headers['x-forwarded-host'],
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'referer': req.headers['referer'] || req.headers['referrer'],
    'host': req.get('host'),
    'protocol': req.protocol
  }));

  // 1. X-Forwarded headers (works if Nginx sends them)
  if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']) {
    const protocol = req.headers['x-forwarded-proto'].split(',')[0].trim();
    const host = req.headers['x-forwarded-host'].split(',')[0].trim();
    const uri = `${protocol}://${host}/api/auth/oidc/callback`;
    logOidc('Using X-Forwarded headers:', uri);
    return uri;
  }
  // 2. Referer header — browser automatically sends the originating page URL
  const referer = req.headers['referer'] || req.headers['referrer'];
  if (referer) {
    try {
      const url = new URL(referer);
      const uri = `${url.protocol}//${url.host}/api/auth/oidc/callback`;
      logOidc('Using Referer header:', uri);
      return uri;
    } catch (e) {
      logOidc('Failed to parse referer:', referer);
    }
  }
  // 3. Explicit FRONTEND_URL env var
  if (process.env.FRONTEND_URL) {
    const uri = `${process.env.FRONTEND_URL.replace(/\/$/, '')}/api/auth/oidc/callback`;
    logOidc('Using FRONTEND_URL env var:', uri);
    return uri;
  }
  // 4. Fallback: derive from request itself
  // If we suspect a reverse proxy (e.g. x-forwarded-host or x-forwarded-for exists)
  // but it didn't pass x-forwarded-proto, assume it's HTTPS (very common for Nginx -> HTTP Node setups)
  let protocol = req.protocol || 'http';
  const host = req.get('host');
  
  if (protocol === 'http' && (req.headers['x-forwarded-host'] || req.headers['x-forwarded-for'])) {
     logOidc('Coercing protocol to https because proxy headers detected without proto');
     protocol = 'https';
  }

  const uri = `${protocol}://${host}/api/auth/oidc/callback`;
  logOidc('Using request host/protocol fallback:', uri);
  return uri;
}

// Helper: normalize issuer_url to always return the well-known config URL
// Handles cases where user pastes the full .well-known URL or just the base issuer URL
function getWellKnownUrl(issuerUrl) {
  const trimmed = issuerUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/.well-known/openid-configuration')) {
    return trimmed; // Already the full URL
  }
  return `${trimmed}/.well-known/openid-configuration`;
}

app.get('/api/auth/oidc/login', (req, res) => {
  db.get('SELECT * FROM oidc_config WHERE id = 1', (err, config) => {
    if (err || !config || !config.enabled) {
      return res.status(400).json({ error: 'OIDC is not configured or disabled' });
    }

    const { issuer_url, client_id, redirect_uri: custom_redirect_uri } = config;
    if (!issuer_url || !client_id) {
      return res.status(400).json({ error: 'Incomplete OIDC config' });
    }

    // Use custom redirect URI if configured, otherwise auto-detect
    const redirect_uri = custom_redirect_uri ? custom_redirect_uri.trim() : getOidcRedirectUri(req);
    // Encode redirect_uri into state so the callback always uses the same URI
    // (the callback's Referer comes from the OIDC provider, not our app)
    const state = Buffer.from(JSON.stringify({ redirect_uri })).toString('base64url');

    fetch(getWellKnownUrl(issuer_url))
      .then(r => r.json())
      .then(openIdConfig => {
        const authUrl = new URL(openIdConfig.authorization_endpoint);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', client_id);
        authUrl.searchParams.set('redirect_uri', redirect_uri);
        authUrl.searchParams.set('scope', 'openid profile email');
        authUrl.searchParams.set('state', state);

        logOidc('Login redirect_uri:', redirect_uri);
        logOidc('Authorization URL:', authUrl.toString());
        res.redirect(authUrl.toString());
      })
      .catch(err => {
        logOidc('ERROR: Failed to fetch OIDC well-known config:', err.message);
        res.status(500).json({ error: 'Failed to initiate OIDC login due to unreachable issuer' });
      });
  });
});

app.get('/api/auth/oidc/callback', (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  db.get('SELECT * FROM oidc_config WHERE id = 1', async (err, config) => {
    if (err || !config || !config.enabled) {
      return res.status(400).send('OIDC is not configured or disabled');
    }

    const { issuer_url, client_id, client_secret, redirect_uri: custom_redirect_uri } = config;
    // Decode redirect_uri from state (set during login) so both sides match exactly
    // Use custom redirect URI if configured as the ultimate fallback
    let redirect_uri = custom_redirect_uri ? custom_redirect_uri.trim() : getOidcRedirectUri(req);
    let decodedState = false;
    try {
      const stateParam = req.query.state;
      if (stateParam) {
        const stateObj = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
        if (stateObj.redirect_uri) {
           redirect_uri = stateObj.redirect_uri;
           decodedState = true;
           logOidc('Successfully decoded state redirect_uri:', redirect_uri);
        }
      }
    } catch (e) {
      logOidc('WARNING: Could not decode state param, using fallback redirect_uri');
    }
    const wellKnownUrl = getWellKnownUrl(issuer_url);

    logOidc('Callback received. Final redirect_uri used for token exchange:', redirect_uri, 'Decoded from state?', decodedState);
    logOidc('Well-known URL:', wellKnownUrl);

    try {
      // 1. Get token endpoint from well-known config
      const wellKnownRes = await fetch(wellKnownUrl);
      if (!wellKnownRes.ok) {
        const text = await wellKnownRes.text();
        throw new Error(`Well-known config fetch failed (${wellKnownRes.status}): ${text.substring(0, 200)}`);
      }
      const openIdConfig = await wellKnownRes.json();
      logOidc('Token endpoint:', openIdConfig.token_endpoint);
      logOidc('Userinfo endpoint:', openIdConfig.userinfo_endpoint);
      
      // 2. Exchange code for tokens
      const tokenBody = new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_id: client_id,
          redirect_uri: redirect_uri
        });

      logOidc('Token request body:', tokenBody.toString(), 'Auth Header:', 'Basic ' + Buffer.from(`${client_id}:${client_secret}`).toString('base64').substring(0, 10) + '...');
      const tokenRes = await fetch(openIdConfig.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${client_id}:${client_secret}`).toString('base64')
        },
        body: tokenBody
      });

      logOidc('Token response status:', tokenRes.status);
      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        logOidc('ERROR: Token exchange failed body:', text);
        return res.redirect(`/login?error=OIDC_Token_Error`);
      }

      const tokenData = await tokenRes.json();
      logOidc('Token type:', tokenData.token_type, 'access_token prefix:', tokenData.access_token?.substring(0, 20) + '...');
      logOidc('Scopes granted:', tokenData.scope);
      
      // Pre-extract from access_token if possible (often used as fallback)
      let accessTokenClaims = null;
      if (tokenData.access_token && tokenData.access_token.includes('.')) {
        try {
          const payloadB64 = tokenData.access_token.split('.')[1];
          accessTokenClaims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
          logOidc('access_token JWT claims:', JSON.stringify(accessTokenClaims));
        } catch (e) {
          logOidc('access_token is not a decodable JWT');
        }
      }
      
      let userInfo;
      
      // Try userinfo endpoint first (standard OIDC approach)
      try {
        const userInfoRes = await fetch(openIdConfig.userinfo_endpoint, {
          headers: {
            'Authorization': `${tokenData.token_type || 'Bearer'} ${tokenData.access_token}`,
            'Accept': 'application/json'
          }
        });
        
        logOidc('UserInfo response status:', userInfoRes.status);
        
        if (userInfoRes.ok) {
          const userInfoText = await userInfoRes.text();
          logOidc('UserInfo response body:', userInfoText.substring(0, 500));
          if (userInfoText) {
            userInfo = JSON.parse(userInfoText);
          }
        } else {
          logOidc('WARNING: UserInfo endpoint returned', userInfoRes.status, '- will try id_token');
        }
      } catch (e) {
        logOidc('WARNING: UserInfo fetch error:', e.message, '- will try id_token');
      }
      
      // Fallback: decode id_token if userinfo didn't work
      if (!userInfo || !(userInfo.preferred_username || userInfo.name || userInfo.email)) {
        if (tokenData.id_token) {
          const parts = tokenData.id_token.split('.');
          if (parts.length === 3) {
            try {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
              logOidc('id_token claims:', JSON.stringify(payload));
              // Merge: prefer userinfo data, supplement with id_token
              userInfo = { ...payload, ...(userInfo || {}) };
            } catch (e) {
              logOidc('ERROR: Failed to decode id_token:', e.message);
            }
          }
        }
      }

      // Final fallback: access_token claims (Keycloak often puts user info here)
      if (!userInfo && accessTokenClaims) {
        userInfo = accessTokenClaims;
      }

      if (!userInfo) {
        throw new Error('Could not obtain user information from either userinfo endpoint or id_token');
      }

      logOidc('Final userInfo:', JSON.stringify(userInfo));

      // 4. Map OIDC user to local user
      // Use standard fallbacks for username
      const username = userInfo.preferred_username || userInfo.name || userInfo.email || userInfo.sub;
      logOidc('Extracted username:', username);
      
      if (!username) {
        logOidc('ERROR: OIDC provider did not return a usable username');
        throw new Error('OIDC provider did not return a usable username. UserInfo: ' + JSON.stringify(userInfo));
      }

      db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
          logOidc('ERROR: Database error during user lookup:', err.message);
          return res.status(500).send('Database error');
        }
        
        let localUserId;
        let localUserRole;

        if (!user) {
          // Create new user automatically
          const hash = await bcrypt.hash(Math.random().toString(36).slice(-10), 10);
          
          await new Promise((resolve, reject) => {
            db.run('INSERT INTO users (username, password_hash, role, auth_type) VALUES (?, ?, ?, ?)', [username, hash, 'USER', 'oidc'], function(err) {
              if (err) reject(err);
              localUserId = this.lastID;
              localUserRole = 'USER';
              resolve();
            });
          });
          console.log('[OIDC] Created new local user:', username, 'id:', localUserId);
        } else {
          localUserId = user.id;
          localUserRole = user.role;
          console.log('[OIDC] Found existing local user:', username, 'id:', localUserId);
          
          if (user.auth_type === 'local') {
            db.run('UPDATE users SET auth_type = ? WHERE id = ?', ['oidc_local', user.id], err => {
              if (err) console.error('[OIDC] Failed to upgrade user auth_type:', err);
              else console.log('[OIDC] Upgraded user auth_type to oidc_local for:', username);
            });
          }
        }

        // 5. Generate local JWT
        const token = jwt.sign({ id: localUserId, username: username, role: localUserRole }, JWT_SECRET);
        
        // 6. Redirect to frontend with token (use relative path so it works behind any reverse proxy)
        const redirectUrl = `/oidc-callback?token=${token}&username=${encodeURIComponent(username)}&role=${localUserRole}&id=${localUserId}`;
        logOidc('Redirecting to frontend (relative):', redirectUrl);
        res.redirect(redirectUrl);
      });

    } catch (err) {
      console.error('OIDC callback error:', err);
      res.status(500).send(`Authentication failed: ${err.message}`);
    }
  });
});

// --- CANVAS ROUTES ---
app.get('/api/canvases', authenticate, (req, res) => {
  db.all('SELECT id, title, elements, appState, updated_at FROM canvases WHERE user_id = ? ORDER BY updated_at DESC', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch canvases' });
    res.json(rows);
  });
});

app.post('/api/canvases', authenticate, (req, res) => {
  const { id, title: providedTitle, elements, appState } = req.body;
  
  const insertCanvas = (finalTitle) => {
    db.run(
      'INSERT INTO canvases (id, user_id, title, elements, appState) VALUES (?, ?, ?, ?, ?)',
      [id, req.user.id, finalTitle, JSON.stringify(elements || []), JSON.stringify(appState || {})],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id, title: finalTitle });
      }
    );
  };

  if (!providedTitle || providedTitle === 'Untitled' || providedTitle === '__NEW_CANVAS__' || /^\d{14}$/.test(providedTitle)) {
    db.all("SELECT title FROM canvases WHERE user_id = ? AND title LIKE '新建画板%'", [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to generate title' });
      
      let maxNum = 0;
      rows.forEach(row => {
        const match = row.title.match(/^新建画板(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      insertCanvas(`新建画板${maxNum + 1}`);
    });
  } else {
    insertCanvas(providedTitle);
  }
});

// Used by shared/read-only links
app.get('/api/public/canvases/:id', (req, res) => {
  db.get('SELECT * FROM canvases WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    if (!row) return res.status(404).json({ error: 'Canvas not found' });
    
    res.json({
      id: row.id,
      title: row.title,
      elements: JSON.parse(row.elements),
      appState: JSON.parse(row.appState)
    });
  });
});

app.get('/api/canvases/:id', authenticate, (req, res) => {
  // Allow fetching if they own it (simplified, no sharing for now)
  db.get('SELECT * FROM canvases WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    if (!row) return res.status(404).json({ error: 'Canvas not found' });
    
    res.json({
      id: row.id,
      title: row.title,
      elements: JSON.parse(row.elements),
      appState: JSON.parse(row.appState)
    });
  });
});

app.put('/api/canvases/:id', authenticate, (req, res) => {
  const { title, elements, appState } = req.body;
  const { id } = req.params;

  db.get('SELECT title FROM canvases WHERE id = ? AND user_id = ?', [id, req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Failed' });
    if (!row) return res.status(404).json({ error: 'Not found' });

    let finalTitle = title;
    if (title === '__NEW_CANVAS__' && row.title && row.title !== '__NEW_CANVAS__') {
      finalTitle = row.title;
    }

    db.run(
      'UPDATE canvases SET title = ?, elements = ?, appState = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [finalTitle, JSON.stringify(elements), JSON.stringify(appState), id, req.user.id],
      function(err) {
        if (err) return res.status(500).json({ error: 'Failed to update canvas' });
        res.json({ success: true });
      }
    );
  });
});

app.put('/api/canvases/:id/title', authenticate, (req, res) => {
  const { title } = req.body;
  const { id } = req.params;

  db.run(
    'UPDATE canvases SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [title, id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to update canvas title' });
      if (this.changes === 0) return res.status(404).json({ error: 'Canvas not found or access denied' });
      res.json({ success: true });
    }
  );
});

app.delete('/api/canvases/:id', authenticate, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM canvases WHERE id = ? AND user_id = ?', [id, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to delete canvas' });
    if (this.changes === 0) return res.status(404).json({ error: 'Canvas not found or access denied' });
    res.json({ success: true, changes: this.changes });
  });
});

// --- STATIC FRONTEND SERVING (PRODUCTION) ---
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../excalidraw-app/build');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Local backend server running on http://0.0.0.0:${PORT} (LAN reachable)`);
});
