#!/bin/bash
# 최초 1회만 실행. SSL 인증서 발급 후 docker compose up -d 로 운영.

set -e

DOMAIN="soma-ai-api.aphelion.ai.kr"
EMAIL="blueskycuj@gmail.com"

CERT_PATH="./nginx/certbot/conf/live/$DOMAIN"
WWW_PATH="./nginx/certbot/www"

mkdir -p "$CERT_PATH" "$WWW_PATH"

echo "=== 임시 자체 서명 인증서 생성 (nginx 첫 기동용) ==="
docker compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out    /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj '/CN=localhost'" certbot

echo "=== nginx + backend 기동 ==="
docker compose up --force-recreate -d nginx backend

echo "=== 임시 인증서 삭제 ==="
docker compose run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/$DOMAIN \
         /etc/letsencrypt/archive/$DOMAIN \
         /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

echo "=== Let's Encrypt 인증서 발급 ==="
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --email $EMAIL \
    -d $DOMAIN \
    --rsa-key-size 4096 \
    --agree-tos \
    --force-renewal" certbot

echo "=== nginx reload ==="
docker compose exec nginx nginx -s reload

echo "=== 완료! 이제 docker compose up -d 로 운영하세요 ==="
