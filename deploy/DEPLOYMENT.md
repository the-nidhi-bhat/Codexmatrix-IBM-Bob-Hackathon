# Legacy Code Whisperer — VM Deployment Guide

Target: DigitalOcean Droplet (or equivalent Ubuntu 22.04/24.04 VM)
Architecture: Single VM with nginx + Node.js backend + Docker

---

## 1. VM Prerequisites

- **OS**: Ubuntu 22.04 LTS or 24.04 LTS (x86_64)
- **Size**: 2 vCPU, 2 GB RAM, 50 GB SSD (minimum starting point)
- **Network**: Public IPv4, SSH access (port 22), HTTP/HTTPS (ports 80/443)

---

## 2. Initial Server Setup

```bash
# Update packages
apt-get update && apt-get upgrade -y

# Install essential tools
apt-get install -y curl gnupg2 ca-certificates lsb-release ubuntu-keyring

# Create dedicated user (not root)
adduser --disabled-password --gecos "" lcw
usermod -aG docker lcw  # After Docker install
```

---

## 3. Node.js 20+ Installation

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify
node --version   # Should be v20.x or v22.x
npm --version
```

---

## 4. Git Installation

```bash
apt-get install -y git

# Verify
git --version
```

---

## 5. Docker Installation

```bash
# Install Docker Engine (official repository)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify
docker version
docker run --rm hello-world

# Create named volume for npm cache (legacy validation)
docker volume create get24-nm
```

---

## 6. nginx Installation

```bash
apt-get install -y nginx

# Verify
nginx -v

# Enable and start
systemctl enable --now nginx
```

---

## 7. Repository Checkout

```bash
# As lcw user
sudo -u lcw -H bash -c '
  cd /opt
  mkdir -p legacy-code-whisperer
  cd legacy-code-whisperer
  git clone https://github.com/the-nidhi-bhat/Codexmatrix-IBM-Bob-Hackathon.git repo
  cd repo
  # Checkout the deployment branch if needed
  # git checkout feat/backend-deployment-hardening
'
```

---

## 8. Frontend Build

```bash
# As lcw user
sudo -u lcw -H bash -c '
  cd /opt/legacy-code-whisperer/repo/frontend
  npm ci
  npm run build
  # Output: /opt/legacy-code-whisperer/repo/frontend/dist/
'
```

---

## 9. Backend Build

```bash
# As lcw user
sudo -u lcw -H bash -c '
  cd /opt/legacy-code-whisperer/repo/backend
  npm ci
  npm run build
  # Output: /opt/legacy-code-whisperer/repo/backend/dist/
'
```

---

## 10. Persistent Filesystem Layout

```
/opt/legacy-code-whisperer/
├── repo/                    # Git repository (persistent, required)
│   ├── frontend/            # Frontend source
│   ├── backend/             # Backend source
│   ├── tools/               # Validation, checkpoint, rollback scripts
│   ├── legacy/              # Legacy Get24 baseline + tests
│   └── validation/          # <-- Validation output directory (persistent)
├── validation/              # Symlink or bind mount to repo/validation/
└── logs/                    # Application logs (optional)
```

**Key requirements:**

| Path | Purpose | Persistence |
|------|---------|-------------|
| `/opt/legacy-code-whisperer/repo/` | Git repo + source + tools + legacy | **MUST persist** |
| `/opt/legacy-code-whisperer/repo/validation/` | Checkpoint/rollback results | **MUST persist** |
| `docker volume get24-nm` | node_modules cache for node:6 | **MUST persist** |

**Setup:**

```bash
# Create validation directory if it doesn't exist
sudo -u lcw -H mkdir -p /opt/legacy-code-whisperer/repo/validation

# Ensure lcw owns everything
chown -R lcw:lcw /opt/legacy-code-whisperer
```

**Why this layout works:**

- `tools/validate.js` resolves `ROOT = path.resolve(__dirname, '..')` → `/opt/legacy-code-whisperer/repo/`
- Docker mount: `-v /opt/legacy-code-whisperer/repo:/app`
- Worktrees created under `os.tmpdir()` (ephemeral, OK)
- `validation/` written by `tools/checkpoint.js` → persists across restarts
- `get24-nm` Docker volume persists npm cache

---

## 11. Environment Variables

```bash
# Create backend.env from template
cp /opt/legacy-code-whisperer/repo/deploy/backend.env.template \
   /opt/legacy-code-whisperer/backend.env

# Edit with actual values
vim /opt/legacy-code-whisperer/backend.env
```

**Required values:**

```bash
NODE_ENV=production
PORT=3001
HOST=127.0.0.1
API_AUTH_TOKEN=<32+ char secret from: openssl rand -hex 32>
FRONTEND_ORIGIN=https://your-domain.example
```

**Permissions:**

```bash
chown lcw:lcw /opt/legacy-code-whisperer/backend.env
chmod 600 /opt/legacy-code-whisperer/backend.env
```

---

## 12. nginx Configuration

```bash
# Copy nginx config
cp /opt/legacy-code-whisperer/repo/deploy/nginx.conf \
   /etc/nginx/sites-available/legacy-code-whisperer

# Enable site
ln -sf /etc/nginx/sites-available/legacy-code-whisperer \
       /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Create auth token injection file (populated at deploy time)
# DO NOT commit real token to git.
# Use your deployment tool (Ansible, Terraform, script) to generate this.
cat > /etc/nginx/auth_token.conf <<'EOF'
proxy_set_header Authorization "Bearer ACTUAL_API_AUTH_TOKEN_HERE";
EOF
chmod 644 /etc/nginx/auth_token.conf

# Update server_name in nginx.conf to your domain
sed -i 's/server_name _;/server_name your-domain.example;/' \
       /etc/nginx/sites-available/legacy-code-whisperer

# Update SSL certificate paths (Let's Encrypt example)
# certbot --nginx -d your-domain.example
# Then update paths in nginx.conf if needed

# Test and reload
nginx -t
systemctl reload nginx
```

---

## 13. HTTPS Setup (Let's Encrypt)

```bash
# Install certbot
apt-get install -y certbot python3-certbot-nginx

# Obtain certificate (interactive)
certbot --nginx -d your-domain.example

# Auto-renewal is set up by certbot (systemd timer)
systemctl status certbot.timer
```

---

## 14. Systemd Service

```bash
# Copy service file
cp /opt/legacy-code-whisperer/repo/deploy/legacy-code-whisperer-backend.service \
   /etc/systemd/system/

# Reload and enable
systemctl daemon-reload
systemctl enable --now legacy-code-whisperer-backend

# Check status
systemctl status legacy-code-whisperer-backend
journalctl -u legacy-code-whisperer-backend -f
```

---

## 15. Health Check

```bash
# Direct backend health (should work)
curl -f http://127.0.0.1:3001/api/health

# Through nginx (should work, no auth required for /health)
curl -f https://your-domain.example/api/health

# Authenticated endpoint test (should work with token)
curl -f -H "Authorization: Bearer $API_AUTH_TOKEN" \
     https://your-domain.example/api/modernization/operations
```

---

## 16. Rollback/Recovery Procedure

| Scenario | Action |
|----------|--------|
| **Backend crash** | `systemctl restart legacy-code-whisperer-backend` (in-memory runs lost, Git branches persist) |
| **Bad modernization commit** | Checkpoint verify → RECOVERY_VERIFIED auto-rollbacks via `git revert` |
| **Validation fails** | Check `validation/last-checkpoint.json`; manual `git revert` if needed |
| **Docker issues** | `docker system prune -a`; rebuild `get24-nm` volume: `docker volume rm get24-nm && docker volume create get24-nm` |
| **Full VM recovery** | Restore `/opt/legacy-code-whisperer/repo/` from backup; recreate `get24-nm` volume; restart services |

**Backup strategy (minimum):**

```bash
# Daily cron for lcw user
# Backup repo (includes validation/, tools/, legacy/)
tar -czf /backup/lcw-repo-$(date +%F).tar.gz -C /opt/legacy-code-whisperer repo
# Backup Docker volume
docker run --rm -v get24-nm:/data -v /backup:/backup alpine tar -czf /backup/get24-nm-$(date +%F).tar.gz -C /data .
```

---

## 17. Firewall (UFW)

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (redirect)
ufw allow 443/tcp   # HTTPS
ufw enable
```

---

## Quick Reference: Service Commands

```bash
# Backend
systemctl status legacy-code-whisperer-backend
systemctl restart legacy-code-whisperer-backend
journalctl -u legacy-code-whisperer-backend -f

# nginx
systemctl status nginx
systemctl reload nginx
nginx -t

# Docker
docker volume ls
docker system df
docker volume rm get24-nm  # recreate if corrupted