#!/bin/bash

# Database Restore Script for Book-Rec
# Usage: ./restore-db.sh <backup-file.db.gz>

set -e

CONTAINER_NAME="book-rec-backend-1"

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup-file.db.gz>"
    echo ""
    echo "Available backups:"
    ls -lh backups/manga-*.db.gz
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Check if container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "Error: Container $CONTAINER_NAME is not running"
    exit 1
fi

# Confirm restore
echo "WARNING: This will replace the current database with:"
echo "  $BACKUP_FILE"
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

# Create temporary directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# Decompress backup
echo "Decompressing backup..."
gunzip -c "$BACKUP_FILE" > "${TMP_DIR}/manga.db"

# Stop backend container
echo "Stopping backend container..."
docker-compose -f docker-compose.prod.yml stop backend

# Restore database
echo "Restoring database..."
docker cp "${TMP_DIR}/manga.db" "${CONTAINER_NAME}:/data/manga.db"

# Start backend container
echo "Starting backend container..."
docker-compose -f docker-compose.prod.yml start backend

# Wait for container to be healthy
echo "Waiting for backend to be ready..."
sleep 5

# Verify
if docker-compose -f docker-compose.prod.yml ps backend | grep -q "healthy"; then
    echo ""
    echo "Database restored successfully!"
else
    echo ""
    echo "Warning: Backend may not be healthy. Check logs:"
    echo "docker-compose -f docker-compose.prod.yml logs backend"
fi
