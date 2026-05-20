#!/bin/bash

# Database Backup Script for Book-Rec
# This script backs up the SQLite database from Docker volume

set -e

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="manga-${TIMESTAMP}.db"
CONTAINER_NAME="book-rec-backend-1"
MAX_BACKUPS=7  # Keep last 7 backups

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "Error: Container $CONTAINER_NAME is not running"
    exit 1
fi

# Backup database
echo "Creating backup: $BACKUP_FILE"
docker cp "${CONTAINER_NAME}:/data/manga.db" "${BACKUP_DIR}/${BACKUP_FILE}"

# Compress backup
gzip "${BACKUP_DIR}/${BACKUP_FILE}"
echo "Backup created: ${BACKUP_DIR}/${BACKUP_FILE}.gz"

# Get file size
SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE}.gz" | cut -f1)
echo "Backup size: $SIZE"

# Clean up old backups (keep only last MAX_BACKUPS)
echo "Cleaning up old backups (keeping last $MAX_BACKUPS)..."
cd "$BACKUP_DIR"
ls -t manga-*.db.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f
cd ..

# List current backups
echo ""
echo "Current backups:"
ls -lh "${BACKUP_DIR}"/manga-*.db.gz

echo ""
echo "Backup completed successfully!"
