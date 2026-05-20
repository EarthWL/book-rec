#!/bin/bash

# Quick Deploy Script for Book-Rec on Ubuntu VPS
# This script automates the entire deployment process

set -e

echo "═══════════════════════════════════════"
echo "  Book-Rec Deployment Script"
echo "═══════════════════════════════════════"
echo ""

# Check if running on Ubuntu
if [ ! -f /etc/lsb-release ]; then
    echo "Error: This script is designed for Ubuntu"
    exit 1
fi

# Check if running as root or with sudo
if [ "$EUID" -eq 0 ]; then 
    echo "Please run as normal user (not root)"
    exit 1
fi

# Get user input
read -p "Enter your domain name: " DOMAIN
read -p "Enter your email for SSL: " EMAIL
read -p "Enter your Gemini API key: " GEMINI_KEY

# Confirm
echo ""
echo "Configuration:"
echo "  Domain: $DOMAIN"
echo "  Email: $EMAIL"
echo "  Gemini API Key: ${GEMINI_KEY:0:10}..."
echo ""
read -p "Continue with deployment? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Deployment cancelled"
    exit 0
fi

# Step 1: Update system
echo ""
echo "[1/7] Updating system..."
sudo apt update && sudo apt upgrade -y

# Step 2: Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    echo ""
    echo "[2/7] Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
else
    echo ""
    echo "[2/7] Docker already installed"
fi

# Step 3: Install Docker Compose if not already installed
if ! command -v docker-compose &> /dev/null; then
    echo ""
    echo "[3/7] Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
else
    echo ""
    echo "[3/7] Docker Compose already installed"
fi

# Step 4: Setup firewall
echo ""
echo "[4/7] Configuring firewall..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Step 5: Create .env file
echo ""
echo "[5/7] Creating environment configuration..."
cat > .env << EOL
GEMINI_API_KEY=$GEMINI_KEY
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_USE_GOOGLE_SEARCH=true
GEMINI_REQUIRE_SOURCE=true
GEMINI_MIN_CONFIDENCE=0.75
CORS_ORIGINS=https://$DOMAIN
DOMAIN=$DOMAIN
EMAIL=$EMAIL
EOL

# Step 6: Build and start containers
echo ""
echo "[6/7] Building and starting containers..."
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Step 7: Setup SSL
echo ""
echo "[7/7] Setting up SSL certificate..."
sleep 10  # Wait for containers to be ready
./setup-ssl.sh $DOMAIN $EMAIL

# Setup automatic backup
echo ""
echo "Setting up daily backups..."
mkdir -p backups
(crontab -l 2>/dev/null; echo "0 2 * * * $(pwd)/backup-db.sh") | crontab -

echo ""
echo "═══════════════════════════════════════"
echo "✓ Deployment Complete!"
echo "═══════════════════════════════════════"
echo ""
echo "Your application is ready at:"
echo "  🌐 https://$DOMAIN"
echo ""
echo "Management commands:"
echo "  View logs:    docker-compose -f docker-compose.prod.yml logs -f"
echo "  Restart:      docker-compose -f docker-compose.prod.yml restart"
echo "  Stop:         docker-compose -f docker-compose.prod.yml down"
echo "  Backup DB:    ./backup-db.sh"
echo ""
echo "Note: You may need to log out and back in for Docker"
echo "      group permissions to take effect"
echo ""
