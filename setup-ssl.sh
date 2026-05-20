#!/bin/bash

# SSL Setup Script for Book-Rec
# Usage: ./setup-ssl.sh yourdomain.com your-email@example.com

set -e

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <domain> <email>"
    echo "Example: $0 example.com admin@example.com"
    exit 1
fi

DOMAIN=$1
EMAIL=$2

echo "Setting up SSL for domain: $DOMAIN"
echo "Email: $EMAIL"
echo ""

# Create certbot directories
mkdir -p certbot/conf certbot/www

# Update nginx config with domain
echo "Updating nginx configuration..."
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" frontend/nginx.prod.conf

# Start containers (HTTP only first for certbot challenge)
echo "Starting containers..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 15

# Get SSL certificate
echo "Obtaining SSL certificate from Let's Encrypt..."
docker run -it --rm \
  -v $(pwd)/certbot/conf:/etc/letsencrypt \
  -v $(pwd)/certbot/www:/var/www/certbot \
  certbot/certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d $DOMAIN

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ SSL certificate obtained successfully!"
    echo ""
    echo "Restarting containers with SSL..."
    docker-compose -f docker-compose.prod.yml down
    docker-compose -f docker-compose.prod.yml up -d
    
    echo ""
    echo "Waiting for services to restart..."
    sleep 10
    
    echo ""
    echo "═══════════════════════════════════════"
    echo "✓ SSL Setup Complete!"
    echo "═══════════════════════════════════════"
    echo ""
    echo "Your application is now available at:"
    echo "  https://$DOMAIN"
    echo ""
    echo "Certificate will auto-renew via certbot container"
    echo ""
else
    echo ""
    echo "✗ Failed to obtain SSL certificate"
    echo ""
    echo "Troubleshooting:"
    echo "1. Verify DNS is pointing to this server:"
    echo "   nslookup $DOMAIN"
    echo ""
    echo "2. Check if ports 80/443 are open:"
    echo "   sudo ufw status"
    echo ""
    echo "3. Check container logs:"
    echo "   docker-compose -f docker-compose.prod.yml logs"
    exit 1
fi
