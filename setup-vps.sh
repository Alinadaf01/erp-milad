#!/bin/bash
set -e

echo "=== Installing Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "=== Installing tools ==="
apt install -y nginx certbot python3-certbot-nginx
npm install -g pm2

echo "=== Installing dependencies ==="
cd /var/www/erp
npm install --legacy-peer-deps

echo "=== Building project ==="
npm run build

echo "=== Starting with PM2 ==="
pm2 delete erp 2>/dev/null || true
pm2 start .output/server/index.mjs --name erp
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

echo "=== Configuring Nginx ==="
cat > /etc/nginx/sites-available/erp << 'EOF'
server {
    listen 80;
    server_name wegalerp.ir www.wegalerp.ir;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/erp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== Done! App running at http://wegalerp.ir ==="
echo "=== Run: certbot --nginx -d wegalerp.ir -d www.wegalerp.ir ==="
