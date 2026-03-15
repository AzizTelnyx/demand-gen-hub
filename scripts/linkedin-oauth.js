const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CREDS_PATH = path.join(os.homedir(), '.config/linkedin-ads/credentials.json');
const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));

const PORT = 9877;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = 'r_ads,r_ads_reporting,r_organization_social,r_organization';

// Step 1: Print auth URL
const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${creds.client_id}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}`;

console.log('\n=== LinkedIn OAuth ===');
console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for callback on port', PORT, '...\n');

// Step 2: Handle callback
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/callback') {
    const code = parsed.query.code;
    const error = parsed.query.error;

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h2>Error: ${error}</h2><p>${parsed.query.error_description || ''}</p>`);
      console.error('OAuth error:', error, parsed.query.error_description);
      server.close();
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h2>No code received</h2>');
      server.close();
      return;
    }

    console.log('Got authorization code, exchanging for token...');

    // Exchange code for token
    const tokenData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      client_id: creds.client_id,
      client_secret: creds.client_secret,
    });

    try {
      const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenData.toString(),
      });

      const tokenJson = await tokenRes.json();

      if (tokenJson.access_token) {
        creds.access_token = tokenJson.access_token;
        creds.refresh_token = tokenJson.refresh_token || null;
        creds.expires_in = tokenJson.expires_in;
        creds.token_obtained_at = new Date().toISOString();
        fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));

        console.log('\n✅ Access token saved!');
        console.log(`   Expires in: ${tokenJson.expires_in} seconds`);

        // Try to get ad accounts
        console.log('\nFetching ad accounts...');
        const adRes = await fetch('https://api.linkedin.com/rest/adAccounts?q=search&search=(status:(values:List(ACTIVE)))&count=50', {
          headers: {
            'Authorization': `Bearer ${tokenJson.access_token}`,
            'LinkedIn-Version': '202401',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        });

        if (adRes.ok) {
          const adData = await adRes.json();
          const accounts = adData.elements || [];
          console.log(`\nFound ${accounts.length} ad account(s):`);
          for (const acc of accounts) {
            const id = acc.id || acc.reference?.split(':').pop();
            console.log(`  ID: ${id} | Name: ${acc.name} | Status: ${acc.status} | Currency: ${acc.currency}`);
          }
          if (accounts.length === 1) {
            creds.ad_account_id = String(accounts[0].id);
            fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));
            console.log(`\nAuto-selected account: ${creds.ad_account_id}`);
          }
        } else {
          console.log('Could not fetch ad accounts:', adRes.status, await adRes.text());
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>✅ LinkedIn connected!</h2><p>You can close this tab.</p>');
      } else {
        console.error('Token error:', tokenJson);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>Token error</h2><pre>${JSON.stringify(tokenJson, null, 2)}</pre>`);
      }
    } catch (e) {
      console.error('Fetch error:', e);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h2>Error</h2><pre>${e.message}</pre>`);
    }

    setTimeout(() => server.close(), 1000);
  }
});

server.listen(PORT);
