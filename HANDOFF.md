# Demand Gen Hub — Handoff Guide for New Bot Instance

This guide sets up the Demand Gen Hub on a new device. Follow every step in order.

---

## Prerequisites

Make sure these are installed:
- Node.js v18+
- Python 3.10+
- `pm2` → `npm install -g pm2`
- `gog` CLI (should already be installed via Clawdbot)

---

## Step 1: Authenticate Google (gog)

The other device needs its own Google OAuth token. Run:

```bash
export GOG_KEYRING_PASSWORD=383b2c9e3c6c3d0bbe325ebfe8735604
gog auth login aziz@telnyx.com
```

It will give you a URL + code — open the URL in any browser, enter the code, sign in as aziz@telnyx.com. This is mandatory and device-bound.

---

## Step 2: Download Credentials from Google Drive

Run this to download the credentials package:

```bash
export GOG_KEYRING_PASSWORD=383b2c9e3c6c3d0bbe325ebfe8735604
gog --account aziz@telnyx.com drive download 1Zy4GzZNGzSzUjZPzAwAuTCqtZhaZpYq3 --out /tmp/telnyx-bot-setup.tar.gz
```

Unpack and install:

```bash
cd /tmp
tar -xzf telnyx-bot-setup.tar.gz

# Drop all configs in place
cp -r telnyx-bot-setup/configs/google-ads ~/.config/
cp -r telnyx-bot-setup/configs/stackadapt ~/.config/
cp -r telnyx-bot-setup/configs/tableau ~/.config/
cp -r telnyx-bot-setup/configs/notion ~/.config/
cp -r telnyx-bot-setup/configs/salesforce ~/.config/
cp -r telnyx-bot-setup/configs/gog ~/.config/

# Clean up
rm -rf /tmp/telnyx-bot-setup /tmp/telnyx-bot-setup.tar.gz
```

---

## Step 3: Set Up Python Virtual Environment

```bash
python3 -m venv ~/.venv
source ~/.venv/bin/activate
pip install google-ads google-auth-oauthlib tableauserverclient
```

Test Google Ads connection:

```bash
source ~/.venv/bin/activate
python3 -c "
from google.ads.googleads.client import GoogleAdsClient
import os
client = GoogleAdsClient.load_from_storage(os.path.expanduser('~/.config/google-ads/credentials.json'))
print('✓ Google Ads connected')
"
```

---

## Step 4: Clone the Demand Gen Hub

```bash
cd ~
git clone https://github.com/AzizTelnyx/demand-gen-hub
cd demand-gen-hub
npm install
```

---

## Step 5: Configure Environment

Create the `.env.local` file:

```bash
cat > ~/demand-gen-hub/.env.local << 'EOF'
# Hub auth
HUB_PASSWORD=telnyx-dg-2026

# Google Ads
GOOGLE_ADS_MCC=289-352-4941
GOOGLE_ADS_ACCOUNT=235-665-0573

# Notion
NOTION_API_KEY=$(cat ~/.config/notion/api_key 2>/dev/null || echo "")
NOTION_COMMAND_CENTER_ID=2fa7970c-5471-80b7-9823-d04f5aa42449
NOTION_TASKS_DB=2fa7970c-5471-8177-b207-f58d76948a7f
NOTION_CAMPAIGNS_DB=2fa7970c-5471-815c-a943-c6868b924727
EOF
```

---

## Step 6: Build and Start the Hub

```bash
cd ~/demand-gen-hub
npm run build
pm2 start npm --name dg-hub -- start
pm2 save
```

Verify it's running:

```bash
pm2 status
curl http://localhost:3000
```

---

## Step 7: Expose with Cloudflare Tunnel (optional)

If you want external access:

```bash
# Install ngrok and authenticate
brew install ngrok
ngrok config add-authtoken YOUR_TOKEN

# Start tunnel with custom domain (ngrok Hobbyist plan)
ngrok http 3000 --domain=telnyx-dg-hub.ngrok.app
```

Public URL: **https://telnyx-dg-hub.ngrok.app**

Health check script at `scripts/check-ngrok.sh` runs every 20 min via cron to auto-restart if tunnel dies.

---

## API Keys Reference

| Service | Location | Notes |
|---------|----------|-------|
| Google Ads | `~/.config/google-ads/credentials.json` | MCC: 289-352-4941, Account: 235-665-0573 |
| StackAdapt | `~/.config/stackadapt/credentials.json` | Advertiser: Telnyx (93053) |
| Tableau | `~/.config/tableau/credentials.json` | Server: prod-apnortheast-a.online.tableau.com |
| Notion | `~/.config/notion/api_key` | Command Center: 2fa7970c-5471-80b7-9823-d04f5aa42449 |
| Salesforce | `~/.config/salesforce/credentials.json` | Instance: telnyx.my.salesforce.com |
| GOG/Google | `~/.config/gog/` | Re-auth required (device-bound) |
| Hub Password | — | `telnyx-dg-2026` |
| GOG Keyring | — | `383b2c9e3c6c3d0bbe325ebfe8735604` |

---

## What to Build / Continue

The hub is a Next.js app. Current pages:
- `/` — Main dashboard
- `/builder` — Campaign Builder
- `/budget` — Budget tracker
- `/chat` — Chat with Lil Aziz
- `/agents` — Agent activity monitor

**To-do / unfinished:**
- Connect live Google Ads data to dashboard widgets
- Real-time campaign performance polling
- Notion sync for daily briefing data
- StackAdapt campaign metrics integration
- Tableau embed for pipeline/SQO data

Source code structure:
```
src/app/          → Next.js pages
src/app/api/      → API routes (Google Ads, agents, etc.)
src/components/   → UI components
src/lib/          → Utility functions
agents/           → Agent scripts and logs
knowledge/        → Brand/product docs for AI context
```

---

## Troubleshooting

**Hub won't start:** Check `pm2 logs dg-hub` for errors. Usually a missing env var.

**Google Ads auth fails:** Re-run `gog auth login aziz@telnyx.com` or check credentials.json format.

**Salesforce token expired:** Run `sf org login web --instance-url https://telnyx.my.salesforce.com`

**Port 3000 in use:** `pm2 delete dg-hub` then restart, or use `PORT=3001 npm start`.
