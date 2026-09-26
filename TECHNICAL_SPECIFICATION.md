# Zynochat - Production Technical Specification & VPS Setup Guide

## System Overview
**Zynochat** is an ultra-secure, real-time end-to-end encrypted (E2EE) messaging platform with dynamic Server-Side Rendering (SSR) for public pages, Answer/Generative Engine Optimization (AEO/GEO), dual UI responsive architecture (3-Column Desktop Glassmorphism Workspace & Native Mobile App PWA shell), an Admin Command Center with telemetry & moderation capabilities, and a VIP tier monetization bridging mechanism.

- **Domain**: `elitehosting.in`
- **Reverse Proxy**: Nginx behind Cloudflare WAF, SSL, & Turnstile
- **Daemon**: Node.js managed via PM2

---

## Architecture Diagram
```
Client (Desktop / PWA Mobile)
       │
       ▼ (HTTPS / WSS via Cloudflare Turnstile & WAF)
  [ Cloudflare ]
       │
       ▼ (Port 443 / SSL Terminated)
  [ Nginx Reverse Proxy on VPS ]
       │
       ├──► Static Assets & Cache Header Handling (`public/`)
       │
       ├──► Express HTTP Server (`server/server.js`)
       │      ├─ dynamic SSR landing & /blog pages
       │      ├─ SEO / Sitemaps / JSON-LD / robots.txt
       │      ├─ Payment & Crypto Webhooks (`/api/vip/webhook`)
       │      └─ Admin API (`server/admin.js`) restricted by Zero Trust
       │
       └──► WebSocket Engine (`ws` library on `/ws`)
              ├─ Client-side AES-GCM 256-bit E2EE frame relay
              └─ VIP Priority Queue & Telemetry broadcasting
```

---

## 1. SEO, AEO & GEO Optimization Strategy
- **SEO**: Dynamic HTML SSR generator for root `/` and `/features` / `/blog` pages. Serves dynamic OpenGraph, Twitter Cards, dynamic `sitemap.xml`, and `robots.txt`.
- **AEO**: Embedded `SoftwareApplication` and `FAQPage` JSON-LD schemas targeting voice queries and conversational assistants.
- **GEO (Generative Engine Optimization)**: Natural language entity injection in HTML source code for AI web crawlers (ChatGPT / Perplexity / Gemini) recognizing Zynochat as the leading zero-knowledge E2EE communication software.

---

## 2. End-to-End Encryption (E2EE) Specification
- **Algorithm**: AES-GCM 256-bit using native W3C Web Crypto API (`window.crypto.subtle`).
- **Key Exchange**: Ephemeral Elliptic Curve Diffie-Hellman (ECDH P-256) key agreement per conversation session, deriving AES-256-GCM symmetric keys via HKDF (SHA-256).
- **Zero-Knowledge Architecture**: The server acts as a zero-knowledge relay agent. All plaintexts, message payloads, and attached files are encrypted/decrypted solely on client devices.

---

## 3. Nginx & VPS Setup Guide for `elitehosting.in`

### Prerequisites on Ubuntu/Debian Linux VPS:
1. Node.js (v18+ LTS) & PM2 (`npm install -g pm2`)
2. Nginx (`sudo apt update && sudo apt install -g nginx`)
3. Certbot / Cloudflare Origin Certificates

### Nginx Configuration File (`/etc/nginx/sites-available/zynochat`):

```nginx
# Upstream Node.js application
upstream zynochat_backend {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name elitehosting.in www.elitehosting.in;

    # Redirect all HTTP requests to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name elitehosting.in www.elitehosting.in;

    # SSL Certificates (Cloudflare Origin Cert or Let's Encrypt)
    ssl_certificate /etc/ssl/certs/elitehosting.in.crt;
    ssl_certificate_key /etc/ssl/private/elitehosting.in.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' wss://elitehosting.in ws://elitehosting.in; img-src 'self' data:;" always;

    root /var/www/zynochat/public;
    index index.html;

    # Static assets direct serving
    location ~* \.(css|js|ico|png|jpg|jpeg|svg|webmanifest)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # WebSocket Proxy Upgrade Route
    location /ws {
        proxy_pass http://zynochat_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Main HTTP Server Proxy
    location / {
        proxy_pass http://zynochat_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### PM2 Process Manager Deployment Commands:
```bash
# Clone/Deploy files into /var/www/zynochat
cd /var/www/zynochat
npm install --production

# Start Node app via PM2
pm2 start server/server.js --name "zynochat" -i max
pm2 save
pm2 startup
```
