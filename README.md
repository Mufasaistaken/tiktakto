# tiktakto

> Setup + Security Baseline (April 19, 2026): Required install baseline for this app is **Node.js LTS (includes npm)**, then project dependencies via `npm install` in the `app/` folder (`express@^4.21.2`, `socket.io@^4.8.1`). For a current vulnerability check on any target environment, run `npm audit` after install.

A web-based two-player Tic-Tac-Toe game with LAN multiplayer.

## Project Structure

```text
tiktakto/
  README.md
  to_push
  scripts/
    bootstrap.ps1
    bootstrap.sh
  app/
    package.json
    public/
      index.html
      styles.css
      app.js
      config.js
    src/
      server.js
```

## Prerequisites

- Node.js LTS (recommended: Node.js 20.x or newer LTS)
- npm (comes bundled with Node.js, no separate npm install needed)

## One-Command Bootstrap (Recommended)

Use these scripts if you want baseline setup + dependency install + app start without doing manual README steps.

### Windows (PowerShell)

From repo root:

```powershell
.\scripts\bootstrap.ps1
```

Options:

```powershell
.\scripts\bootstrap.ps1 -Port 3000
.\scripts\bootstrap.ps1 -SkipStart
```

What it does:

1. Checks for `node`/`npm`.
2. If missing, attempts Node.js LTS install via `winget`.
3. Runs `npm install` in `app/`.
4. Starts server (`npm start`) unless `-SkipStart` is used.

### Linux (bash)

From repo root:

```bash
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh
```

Options:

```bash
./scripts/bootstrap.sh --port 3000
./scripts/bootstrap.sh --skip-start
```

What it does:

1. Checks for `node`/`npm`.
2. If missing, attempts Node.js LTS install using NodeSource (`apt-get` or `dnf`).
3. Runs `npm install` in `app/`.
4. Starts server (`npm start`) unless `--skip-start` is used.

Check versions:

```bash
node -v
npm -v
```

## Install Node.js + npm

### Windows

1. Install Node.js LTS from `https://nodejs.org`.
2. Re-open PowerShell after install.
3. Verify:

```powershell
node -v
npm -v
```

### Linux (Ubuntu/Debian)

Use NodeSource for current LTS (recommended over distro-default older packages):

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

### Linux (RHEL/CentOS/Fedora)

```bash
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo dnf install -y nodejs
node -v
npm -v
```

## Run the App (Any OS)

From the project root:

```bash
cd app
npm install
npm start
```

Default URL:

- `http://localhost:3000`

The server binds on `0.0.0.0`, so LAN devices can connect if firewall rules allow port `3000`.

## Vercel Frontend + External Backend

Vercel should host the static frontend only. Host Node/Socket.IO backend separately (VM/Render/Railway/Fly).

### Frontend (Vercel)

Set Vercel project to:

- Root Directory: `app/public`
- Framework Preset: `Other`
- Build Command: *(empty)*
- Output Directory: `.`

### Backend URL wiring

Edit `app/public/config.js`:

```js
window.__TOE_CONFIG__ = {
  BACKEND_URL: "https://your-backend.example.com"
};
```

Then redeploy Vercel.

### Backend CORS/origin allowlist

On backend host, set:

- `CLIENT_ORIGINS=https://your-vercel-app.vercel.app`
- `ALLOW_NO_ORIGIN=false`

### Security-related environment variables

- `CLIENT_ORIGINS`:
  - Optional comma-separated allowed browser origins for Socket.IO handshake.
  - Example: `https://toe.example.com,https://www.toe.example.com`
- `TRUST_PROXY`:
  - Trusted proxy setting used for real client IP extraction (`proxy-addr` format).
  - Recommended when behind reverse proxy, example: `loopback` or subnet/CIDR list.
- `ALLOW_NO_ORIGIN`:
  - Optional allowance for non-browser socket clients.
  - Default: `false` (recommended for production).
- `PUBLIC_DIR`:
  - Optional override for static asset directory path.
  - Default: `app/public` resolved from server location.
- `MAX_ACTIVE_ROOMS`:
  - Optional cap on concurrent rooms (default: `2000`).
- `STALE_ROOM_MS`:
  - Optional stale-room cleanup threshold in milliseconds (default: `3600000` = 1 hour).
- `MAX_SOCKETS_TOTAL`:
  - Optional cap on total concurrent socket connections (default: `5000`).
- `MAX_SOCKETS_PER_CLIENT`:
  - Optional cap on concurrent socket connections per client fingerprint/IP (default: `25`).
- `MAX_SCORE`:
  - Optional upper bound for score counters to prevent runaway growth (default: `999`).

## Play on your internal network

1. Find your host machine IPv4 address.
2. On another device on the same network, open:
   - `http://<HOST_IP>:3000` (example: `http://192.168.1.25:3000`)
3. Player 1 selects `Separate Devices` -> `Yes` -> `Generate Key`.
4. Player 1 shares the room key and clicks `Start Game`.
5. Player 2 selects `Separate Devices` -> `No`, enters 8-character alphanumeric room key, then clicks `Join`.

## Hosting and Deployment

## Public VM Hosting (All External Users)

If this repo is deployed to a VM and should be reachable by all users on the internet, use this baseline structure:

### Recommended server layout (Linux VM)

```text
/srv/tiktakto/
  current/                 # cloned repo root
    README.md
    scripts/
    app/
      package.json
      public/
      src/
```

Run Node app internally on `127.0.0.1:3000`, and expose public traffic through Nginx or Apache on `80/443`.

### Required infrastructure checklist

1. Public DNS A/AAAA record pointing to VM public IP.
2. Cloud/VM firewall rules:
   - allow inbound `80/tcp` and `443/tcp`
   - block direct public access to internal app port (`3000`) when using reverse proxy
3. TLS certificate (Let's Encrypt recommended).
4. Process manager for Node app (systemd or PM2).

### Systemd service (recommended)

Create `/etc/systemd/system/tiktakto.service`:

```ini
[Unit]
Description=TikTakTo Node Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/tiktakto/current/app
Environment=PORT=3000
ExecStart=/usr/bin/node /srv/tiktakto/current/app/src/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable/start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable tiktakto
sudo systemctl start tiktakto
sudo systemctl status tiktakto
```

### Option A: Direct Node.js Hosting (simple)

Use this when you want a quick deployment on one server VM or machine.

1. Install Node.js LTS + npm.
2. Upload/clone repo.
3. Run:

```bash
cd app
npm install
PORT=3000 npm start
```

Windows PowerShell:

```powershell
cd app
$env:PORT=3000
npm start
```

4. Open firewall for app port (example `3000`).

### Option B: Linux + Nginx Reverse Proxy (recommended production)

Use Node app on internal `127.0.0.1:3000` and expose public HTTPS via Nginx.

1. Ensure Node app is running as a service (`tiktakto.service`).
2. Create Nginx site config at `/etc/nginx/sites-available/tiktakto`:

```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/tiktakto /etc/nginx/sites-enabled/tiktakto
sudo nginx -t
sudo systemctl reload nginx
```

4. Add TLS certificate:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example.com
```

5. Add HSTS on the HTTPS server block (after certbot creates it):

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

6. Verify from external network:
   - `https://your-domain.example.com`

### Option C: Linux + Apache Reverse Proxy

1. Ensure Node app is running as a service (`tiktakto.service`).
2. Enable modules:

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers
sudo systemctl restart apache2
```

3. Create vhost `/etc/apache2/sites-available/tiktakto.conf`:

```apache
<VirtualHost *:80>
    ServerName your-domain.example.com

    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*) ws://127.0.0.1:3000/$1 [P,L]
</VirtualHost>
```

4. Enable site:

```bash
sudo a2ensite tiktakto.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

5. Add TLS (recommended) with Certbot Apache plugin.
6. On the HTTPS vhost, add HSTS:

```apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
```

### Expected architecture patterns

- `Nginx architecture`: Internet -> Nginx (`80/443`) -> Node app (`127.0.0.1:3000`)  
- `Apache architecture`: Internet -> Apache (`80/443`) -> Node app (`127.0.0.1:3000`)

### Option D: Windows Server Hosting

Two common approaches:

1. Run directly with Node (`npm start`) and keep terminal/service alive.
2. Put IIS/Nginx in front as reverse proxy to `http://localhost:3000`.

Recommended for stability:

- Run app as a background service (for example with PM2 or Windows service wrapper).
- Open inbound firewall on web port (`80/443`) and/or app port if exposed directly.

## Process Management (recommended)

For long-running production, use a process manager.

### PM2 (Linux or Windows)

```bash
npm install -g pm2
pm2 start app/src/server.js --name tiktakto
pm2 save
```

## Troubleshooting

- `npm: command not found`:
  - Node.js is not installed or terminal needs restart.
- Port already in use:
  - Change port (`cd app && PORT=3001 npm start`) or stop conflicting app.
- Other devices cannot connect:
  - Check server IP, firewall rules, and router/AP network isolation.
- WebSocket issues behind proxy:
  - Ensure reverse proxy forwards `Upgrade` and `Connection` headers.

## Controls

- `New Round`: clears board, keeps score.
- `Reset Score`: clears board and score.
- `Forfeit Game`: exits current game and returns to setup.
