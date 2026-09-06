# Deployment Guide — Workspace v1

Target: **https://workspace.benedictisaac.dev**
Stack: Vite + React PWA (frontend) + Express API + MongoDB Atlas (database)

---

## Architecture

```
Internet → Cloudflare DNS → EC2 (Nginx :443 reverse proxy)
                              ↓
                          Node.js app (PM2, :3000)
                              ↓
                       MongoDB Atlas
```

EC2 runs Nginx (HTTPS + static + reverse proxy) + Node.js app via PM2. Free tier eligible (t2.micro/t3.micro for 1 year).

---

## EC2 Setup (Ubuntu 22.04 LTS)

### 1. Launch EC2 Instance

- AWS Console → EC2 → **Launch Instance**
- **AMI:** Ubuntu Server 22.04 LTS (free tier eligible)
- **Instance type:** `t3.micro` (1 GB RAM — sufficient; or `t3.small` for headroom)
- **Key pair:** create or select existing `.pem` (you'll need this to SSH)
- **Network settings:**
  - Allow SSH (22) from your IP
  - Allow HTTPS (443) from anywhere (0.0.0.0/0)
  - Allow HTTP (80) from anywhere (for Let's Encrypt challenge)
- **Storage:** 20 GB gp3 (default 8 GB is too tight)
- **Elastic IP:** allocate and associate (so the IP doesn't change on reboot)

### 2. SSH In & Install Dependencies

```bash
ssh -i ~/path/to/your-key.pem ubuntu@<EC2_PUBLIC_IP>

sudo apt update && sudo apt upgrade -y

# Node.js 20 (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 (process manager — keeps app alive, auto-restart)
sudo npm install -g pm2

# Nginx (reverse proxy + static + HTTPS)
sudo apt install -y nginx

# Certbot (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx

# Build tools (for native modules)
sudo apt install -y build-essential
```

### 3. Deploy the App

```bash
# Clone your repo
cd ~
git clone https://github.com/Benedict258/Workspace.git app
cd app

# Install deps + build
npm install
npm run build

# Verify the build
ls dist/        # should have index.html, assets/, server.cjs, sw.js, workbox-*.js
```

### 4. Configure Environment

```bash
# Create .env (NEVER commit this)
nano .env
```

Paste (using your actual values):

```env
NODE_ENV=production
MONGO_URI=mongodb+srv://benedictisaac258_db_user:u8piSxxAxpnS6MeQ@workspace.jwh4owf.mongodb.net/workspace
FRONTEND_URL=https://workspace.benedictisaac.dev
GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-google-oauth-client-secret>
GOOGLE_REDIRECT_URI=https://workspace.benedictisaac.dev/api/calendar/callback
```

```bash
# Restrict permissions
chmod 600 .env

# Test that it starts
node dist/server.cjs
# Should print "MongoDB connected" + "Workspace full-stack app running on http://0.0.0.0:3000"
# Ctrl+C to stop
```

### 5. Start with PM2

```bash
# Start in background, auto-restart on crash
pm2 start dist/server.cjs --name workspace --env production

# Save the process list so it survives reboot
pm2 save

# Enable systemd startup script
pm2 startup systemd
# Copy-paste the command it prints (it adds a systemd service for PM2)

# Useful PM2 commands
pm2 status
pm2 logs workspace
pm2 restart workspace
pm2 stop workspace
```

### 6. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/workspace
```

Paste (replace `your-ec2-ip-or-domain` with the placeholder; we'll add the real domain after certs):

```nginx
server {
    listen 80;
    server_name workspace.benedictisaac.dev;

    # Allow large uploads (calendar sync payloads, etc.)
    client_max_body_size 10M;

    # Reverse-proxy all /api/* to Node
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # Everything else → Node (it serves the SPA + service worker)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/workspace /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default   # remove default site
sudo nginx -t                              # test config
sudo systemctl reload nginx
```

### 7. DNS — Point Your Domain

In your DNS provider (Cloudflare, Namecheap, Route53, etc.):

- **A record:** `workspace.benedictisaac.dev` → `<EC2_ELASTIC_IP>`

Wait 1–5 min for propagation.

### 8. HTTPS with Let's Encrypt

```bash
sudo certbot --nginx -d workspace.benedictisaac.dev
```

Certbot will:
- Issue a cert
- Modify your Nginx config to redirect HTTP → HTTPS
- Set up auto-renewal via systemd timer

Verify auto-renewal:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

### 9. Atlas Network Access

**Critical:** the EC2 instance's outbound IP must be allowed.

- Atlas → Network Access → **Add IP Address**
- Easiest: `0.0.0.0/0` (allows any IP — fine for a single-user app)
- Better: add the **Elastic IP** of your EC2 instance

### 10. Final Verify

```bash
# From your laptop
curl https://workspace.benedictisaac.dev/api/health
# Expected: {"status":"ok","timestamp":"...","mongoConnected":true}
```

Open https://workspace.benedictisaac.dev in browser:
- Passcode gate appears (`BenedictIsaac#258`)
- Today / Week / Goals views show live Atlas data
- 30 seeded threads visible in Threads view
- 3 seeded wishlist items + 3 goals visible

---

## Ongoing Operations

### Deploy updates

```bash
ssh -i ~/path/to/key.pem ubuntu@<EC2_IP>
cd ~/app
git pull origin main
npm install         # if deps changed
npm run build       # rebuild
pm2 restart workspace
```

### View logs

```bash
pm2 logs workspace           # live tail
pm2 logs workspace --lines 200
```

### MongoDB backup (recommended)

Atlas → Cluster → **Backup** → Continuous backup is enabled by default on M10+ tiers (M0 free tier has daily snapshots only, retained 2 days).

For the free tier:
- **Manual export:** Atlas → Cluster → Collections → Export → Connect with `mongosh` or Compass
- **Automated:** set up a cron on EC2:

```bash
mkdir -p ~/backups
0 3 * * * cd ~/app && node -e "
const {execSync} = require('child_process');
const ts = new Date().toISOString().split('T')[0];
execSync(\`mongodump --uri=\${process.env.MONGO_URI} --out=~/backups/\${ts}\`);
" >> ~/backups/cron.log 2>&1
```

### Security hardening (5 min, worth it)

```bash
# UFW firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Disable root login & password auth (key-only)
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no, PermitRootLogin no
sudo systemctl restart sshd

# Automatic security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Monitoring (free)

- **Uptime:** UptimeRobot free tier → ping `https://workspace.benedictisaac.dev/api/health` every 5 min
- **Server:** PM2 has built-in monitoring (`pm2 monit`)
- **CloudWatch:** install the SSM agent for OS-level metrics (optional)

---

## Cost Estimate

| Service | Free Tier | Paid |
|---|---|---|
| EC2 t3.micro | 750 hr/mo for 12 months | ~$8/mo after |
| EBS 20 GB | 30 GB free | ~$2/mo |
| Elastic IP | Free while attached | — |
| Route 53 (if used) | — | ~$0.50/mo per zone |
| Let's Encrypt | Free forever | — |
| MongoDB Atlas M0 | 512 MB free forever | — |
| Cloudflare DNS (optional) | Free | — |
| **Total year 1** | **~$0–$4/mo** | |
| **Total year 2+** | | **~$10–12/mo** |

---

## Rollback

The deploy process is **atomic** via PM2:

```bash
# Find previous version
git log --oneline -5
git checkout <previous-commit>
npm run build
pm2 restart workspace
```

The MongoDB seed function is **idempotent** (only inserts when collections empty), so redeploys never duplicate data.

---

## Troubleshooting

**App won't start:**
```bash
pm2 logs workspace --lines 50   # check error
node dist/server.cjs             # run in foreground to see the error
```

**MongoDB connection fails:**
- Atlas → Network Access — verify EC2's Elastic IP is whitelisted
- Check `MONGO_URI` is correct in `.env`

**Cert renewal fails:**
```bash
sudo certbot renew --dry-run
sudo systemctl status certbot.timer
```

**Nginx 502 Bad Gateway:**
- App isn't running: `pm2 status`
- Port mismatch: `sudo ss -tlnp | grep 3000`
