# Deployment Guide - Ubuntu VPS

This guide will help you deploy the Book-Rec application on an Ubuntu VPS server using Docker.

## Prerequisites

- Ubuntu 20.04+ VPS with root access
- Domain name pointing to your server IP
- At least 2GB RAM, 20GB storage
- Port 80 and 443 open in firewall

## Step 1: Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl git ufw

# Setup firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Step 2: Install Docker and Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version

# Log out and log back in for group changes to take effect
exit
```

## Step 3: Clone Repository

```bash
# Clone your repository
cd /opt
sudo git clone https://github.com/YOUR_USERNAME/book-rec.git
cd book-rec

# Or upload files using scp:
# scp -r /path/to/book-rec user@your-server-ip:/opt/
```

## Step 4: Configure Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Edit .env file with your values
nano .env
```

**Required variables:**
```bash
GEMINI_API_KEY=your_actual_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_USE_GOOGLE_SEARCH=true
CORS_ORIGINS=https://yourdomain.com
DOMAIN=yourdomain.com
EMAIL=your-email@example.com
```

## Step 5: Setup SSL Certificate (Let's Encrypt)

```bash
# Create certbot directories
mkdir -p certbot/conf certbot/www

# Update nginx config with your domain
cd frontend
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" nginx.prod.conf
cd ..

# Start containers without SSL first (for certbot challenge)
docker-compose -f docker-compose.prod.yml up -d

# Wait for containers to start
sleep 10

# Get SSL certificate
docker run -it --rm \
  -v $(pwd)/certbot/conf:/etc/letsencrypt \
  -v $(pwd)/certbot/www:/var/www/certbot \
  certbot/certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  -d $DOMAIN

# Restart containers to use SSL
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

## Step 6: Verify Deployment

```bash
# Check container status
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Test health endpoint
curl http://localhost/health

# Test API
curl https://$DOMAIN/api/dashboard
```

## Step 7: Setup Automatic Backups

```bash
# Make backup script executable
chmod +x backup-db.sh

# Add to crontab (daily backup at 2 AM)
crontab -e

# Add this line:
0 2 * * * /opt/book-rec/backup-db.sh
```

## Maintenance Commands

### View Logs
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend
```

### Restart Services
```bash
# Restart all
docker-compose -f docker-compose.prod.yml restart

# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend
```

### Update Application
```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

### Database Backup
```bash
# Manual backup
./backup-db.sh

# List backups
ls -lh backups/

# Restore from backup
docker cp backups/manga-20240120-020000.db book-rec-backend-1:/data/manga.db
docker-compose -f docker-compose.prod.yml restart backend
```

### SSL Certificate Renewal
```bash
# Certificates auto-renew via certbot container
# To manually renew:
docker run --rm \
  -v $(pwd)/certbot/conf:/etc/letsencrypt \
  -v $(pwd)/certbot/www:/var/www/certbot \
  certbot/certbot renew
```

## Monitoring

### Check Resource Usage
```bash
# Container stats
docker stats

# Disk usage
df -h
du -sh /opt/book-rec
docker system df
```

### Clean Up
```bash
# Remove unused images
docker image prune -a

# Remove unused volumes (CAREFUL - don't delete data volume!)
docker volume ls
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs backend

# Check if port is already in use
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443
```

### Database Issues
```bash
# Access database volume
docker run --rm -v book-rec_manga-data:/data alpine ls -la /data

# Backup and reset
./backup-db.sh
docker volume rm book-rec_manga-data
docker-compose -f docker-compose.prod.yml up -d
```

### SSL Certificate Issues
```bash
# Check certificate
docker run --rm \
  -v $(pwd)/certbot/conf:/etc/letsencrypt \
  certbot/certbot certificates

# Force renewal
docker run --rm \
  -v $(pwd)/certbot/conf:/etc/letsencrypt \
  -v $(pwd)/certbot/www:/var/www/certbot \
  certbot/certbot renew --force-renewal
```

## Security Recommendations

1. **Change default ports** if needed
2. **Enable firewall** (UFW)
3. **Regular updates**: `sudo apt update && sudo apt upgrade`
4. **Monitor logs** regularly
5. **Backup database** daily
6. **Use strong passwords** for VPS access
7. **Setup fail2ban** for SSH protection:
   ```bash
   sudo apt install fail2ban
   sudo systemctl enable fail2ban
   ```

## Performance Tuning

### For servers with limited RAM
```bash
# Add swap space
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Nginx optimization
Edit `frontend/nginx.prod.conf`:
- Adjust `worker_processes` based on CPU cores
- Tune `worker_connections`
- Enable caching if needed

## Support

For issues or questions:
- Check logs: `docker-compose -f docker-compose.prod.yml logs`
- Review this guide
- Check GitHub issues

## Quick Reference

```bash
# Start application
docker-compose -f docker-compose.prod.yml up -d

# Stop application
docker-compose -f docker-compose.prod.yml down

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Backup database
./backup-db.sh

# Update application
git pull && docker-compose -f docker-compose.prod.yml up -d --build
```
