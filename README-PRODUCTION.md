# Book-Rec - Production Deployment

Manga/Book collection management system with barcode scanning and AI-powered metadata lookup.

## Quick Start (Production)

### 1. Prerequisites
- Ubuntu 20.04+ VPS
- Docker & Docker Compose installed
- Domain name pointing to your server
- Gemini API key

### 2. Deploy

```bash
# Clone repository
git clone <your-repo-url>
cd book-rec

# Configure environment
cp .env.example .env
nano .env  # Add your GEMINI_API_KEY and DOMAIN

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Setup SSL (replace with your domain)
./setup-ssl.sh yourdomain.com your-email@example.com
```

### 3. Access
- Application: https://yourdomain.com
- API: https://yourdomain.com/api/dashboard
- Health Check: https://yourdomain.com/health

## Features

- 📱 **Barcode Scanning** - Use camera to scan ISBN barcodes
- 🤖 **AI Metadata Lookup** - Automatic book info via Gemini API + Google Search
- 📚 **Series Management** - Organize books by series with cover images
- 🔍 **Search** - Full-text search across titles, authors, ISBNs
- ✏️ **Edit & Delete** - Manage your collection
- 📊 **Dashboard** - Stats and recent additions
- 🌐 **Thai Language Support** - Optimized for Thai manga/light novels

## Architecture

```
┌─────────────────┐
│   Frontend      │  React + TypeScript + Vite
│   (Nginx)       │  Camera scanning, responsive UI
└────────┬────────┘
         │ HTTPS
┌────────┴────────┐
│   Backend       │  FastAPI + Python
│   (Uvicorn)     │  Metadata lookup, SQLite DB
└─────────────────┘
```

## Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- @zxing/browser (barcode scanning)
- Lucide React (icons)
- Nginx (production server)

**Backend:**
- FastAPI (Python web framework)
- SQLite (database)
- Gemini API (metadata lookup)
- httpx (async HTTP client)
- Pydantic (data validation)

**Infrastructure:**
- Docker & Docker Compose
- Let's Encrypt SSL
- Automatic certificate renewal

## File Structure

```
book-rec/
├── backend/
│   ├── app/
│   │   ├── main.py          # API endpoints
│   │   ├── database.py      # SQLite operations
│   │   ├── metadata.py      # Gemini integration
│   │   └── schemas.py       # Pydantic models
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main component
│   │   ├── api.ts           # API client
│   │   ├── types.ts         # TypeScript types
│   │   └── styles.css       # Styling
│   ├── Dockerfile
│   ├── Dockerfile.prod      # Production build
│   ├── nginx.conf           # Dev nginx config
│   └── nginx.prod.conf      # Production nginx config
├── docker-compose.yml       # Development setup
├── docker-compose.prod.yml  # Production setup
├── .env.example             # Environment template
├── backup-db.sh             # Database backup script
├── restore-db.sh            # Database restore script
└── DEPLOYMENT.md            # Full deployment guide
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | (required) | Your Gemini API key |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Model to use |
| `GEMINI_USE_GOOGLE_SEARCH` | `true` | Enable Google Search grounding |
| `CORS_ORIGINS` | `https://yourdomain.com` | Allowed origins |
| `DOMAIN` | `yourdomain.com` | Your domain for SSL |
| `EMAIL` | (required) | Email for Let's Encrypt |

## Database Schema

**Series Table:**
- id, title, original_title, author, publisher
- status, notes, cover_url
- created_at, updated_at

**Volumes Table:**
- id, series_id, title, volume_number
- isbn_13, isbn_10, barcode, cover_url
- published_date, purchased_at
- storage_location, notes
- created_at, updated_at

## API Endpoints

- `GET /health` - Health check
- `GET /api/dashboard` - Stats + recent additions
- `GET /api/collection?search=` - List all series with volumes
- `GET /api/volumes/{id}` - Get volume details
- `POST /api/metadata/lookup` - ISBN metadata lookup
- `POST /api/volumes` - Create volume
- `PUT /api/volumes/{id}` - Update volume
- `DELETE /api/volumes/{id}` - Delete volume

## Maintenance

### Backup Database
```bash
# Manual backup
./backup-db.sh

# Automated (add to crontab)
0 2 * * * /opt/book-rec/backup-db.sh
```

### Restore Database
```bash
./restore-db.sh backups/manga-20240120-020000.db.gz
```

### Update Application
```bash
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```

### View Logs
```bash
docker-compose -f docker-compose.prod.yml logs -f
```

## Cost Estimation (Gemini API)

- **50 lookups/month**: ~฿10/month
- **100 lookups/month**: ~฿19/month
- **200 lookups/month**: ~฿39/month

*Includes Google Search grounding (first 1,500 queries/day free)*

## Security Features

- ✅ HTTPS with auto-renewal
- ✅ Security headers (HSTS, X-Frame-Options, etc.)
- ✅ CORS protection
- ✅ Health checks
- ✅ Automatic restarts
- ✅ SQLite with foreign key constraints
- ✅ Input validation (Pydantic)

## Troubleshooting

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed troubleshooting guide.

Common issues:
- **SSL not working**: Check domain DNS, certbot logs
- **Backend not responding**: Check logs, GEMINI_API_KEY
- **Database errors**: Check volume permissions

## License

MIT License - See LICENSE file

## Support

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)
