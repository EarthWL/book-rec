# Book-Rec 📚

AI-powered manga and book collection management system with barcode scanning and automatic metadata lookup.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.12-blue.svg)
![React](https://img.shields.io/badge/react-18-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

## Features

- 📱 **Barcode Scanning** - Use your phone camera to scan ISBN barcodes
- 🤖 **AI Metadata Lookup** - Automatic book information via Gemini API with Google Search grounding
- 📚 **Series Management** - Organize books by series with automatic cover images
- 🔍 **Full-Text Search** - Search across titles, authors, publishers, and ISBNs
- ✏️ **Edit & Delete** - Manage your collection easily
- 📊 **Dashboard** - Statistics and recent additions
- 🌐 **Thai Language Support** - Optimized for Thai manga and light novels
- 🎨 **Modern UI** - Clean, responsive design that works on all devices

## Screenshots

[Add your screenshots here]

## Quick Start

### Development (Docker Compose)

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/book-rec.git
cd book-rec

# Create .env file
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Start services
docker-compose up -d

# Access application
open http://localhost:8080
```

### Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete production deployment guide on Ubuntu VPS.

**Quick deploy:**
```bash
./deploy.sh
```

## Tech Stack

### Frontend
- **React 18** + TypeScript
- **Vite** - Lightning fast build tool
- **@zxing/browser** - Barcode scanning
- **Lucide React** - Beautiful icons

### Backend
- **FastAPI** - Modern Python web framework
- **SQLite** - Lightweight database
- **Gemini API** - AI-powered metadata lookup
- **Pydantic** - Data validation

### Infrastructure
- **Docker** + Docker Compose
- **Nginx** - Web server and reverse proxy
- **Let's Encrypt** - Free SSL certificates

## Architecture

```
┌─────────────────────────────────────┐
│         Frontend (React)            │
│  - Camera scanning                  │
│  - Collection management            │
│  - Search & filtering               │
└──────────────┬──────────────────────┘
               │ HTTPS/REST API
┌──────────────┴──────────────────────┐
│        Backend (FastAPI)            │
│  - Metadata lookup (Gemini API)     │
│  - Database operations (SQLite)     │
│  - Duplicate detection              │
└─────────────────────────────────────┘
```

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | (required) | Your Google Gemini API key |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Gemini model to use |
| `GEMINI_USE_GOOGLE_SEARCH` | `true` | Enable Google Search grounding |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |

See [`.env.example`](./.env.example) for all available options.

## Database Schema

**Series:**
- Automatic grouping by normalized title and author
- Cover image from first volume
- Track reading status and notes

**Volumes:**
- Unique ISBN-13, ISBN-10, and barcode constraints
- Support for volume numbers (1, 2, 3.5, etc.)
- Storage location tracking
- Purchase and publication dates

## Development

### Backend Development
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/dashboard` | GET | Get statistics |
| `/api/collection` | GET | List all series with volumes |
| `/api/metadata/lookup` | POST | Lookup ISBN metadata |
| `/api/volumes` | POST | Create new volume |
| `/api/volumes/{id}` | PUT | Update volume |
| `/api/volumes/{id}` | DELETE | Delete volume |

## Cost Estimation

### Gemini API (with Google Search)
- 50 lookups/month: ~฿10 (~$0.28)
- 100 lookups/month: ~฿19 (~$0.55)
- 200 lookups/month: ~฿39 (~$1.11)

*Free tier: 1,500 grounded queries per day*

### VPS Hosting
- Recommended: 2GB RAM, 20GB storage
- Cost: $5-10/month (DigitalOcean, Vultr, Linode)

## Deployment

### Prerequisites
- Ubuntu 20.04+ VPS
- Docker & Docker Compose
- Domain name (for SSL)
- Gemini API key

### One-Command Deploy
```bash
./deploy.sh
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

## Backup & Restore

```bash
# Backup database
./backup-db.sh

# Restore from backup
./restore-db.sh backups/manga-20240120-020000.db.gz
```

Automatic daily backups can be configured via cron.

## Security Features

- ✅ HTTPS with auto-renewal (Let's Encrypt)
- ✅ Security headers (HSTS, X-Frame-Options, CSP)
- ✅ CORS protection
- ✅ Input validation (Pydantic)
- ✅ SQLite with foreign key constraints
- ✅ Health checks and auto-restart

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Roadmap

- [ ] Enhanced search filters (status, date range, storage location)
- [ ] Series detail view and management
- [ ] Bulk import from CSV/Excel
- [ ] Export collection to various formats
- [ ] Mobile app (React Native)
- [ ] Multi-user support with authentication
- [ ] Reading progress tracking
- [ ] Wishlist and purchase recommendations

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Gemini API](https://ai.google.dev/) - AI-powered metadata lookup
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [React](https://react.dev/) - UI library
- [@zxing/browser](https://github.com/zxing-js/browser) - Barcode scanning
- [Let's Encrypt](https://letsencrypt.org/) - Free SSL certificates

## Support

- 📖 Documentation: [DEPLOYMENT.md](./DEPLOYMENT.md)
- 🐛 Issues: [GitHub Issues](https://github.com/YOUR_USERNAME/book-rec/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/YOUR_USERNAME/book-rec/discussions)

## Author

Created with ❤️ by [Your Name]

---

**Note:** This application is designed for personal use. Please respect copyright laws and only scan books you own.
