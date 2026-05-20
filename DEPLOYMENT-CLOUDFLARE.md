# Deploy behind Cloudflare Zero Trust + Traefik

This host already runs **Cloudflare Tunnel (`cloudflared`)** and **Traefik** on
the shared external Docker network `proxy`. Use `docker-compose.deploy.yml` —
it plugs into that setup instead of publishing ports or running certbot.

```
Cloudflare (Access / Zero Trust)
   └─ cloudflared tunnel
        └─ Traefik  (entrypoint `web`, network `proxy`)
             └─ frontend  (nginx :80, proxies /api → backend)
                  └─ backend (FastAPI :8000, validates the Access JWT)
```

TLS is terminated by Cloudflare, so the containers only speak plain HTTP to
Traefik. Authentication is enforced **in the backend** by validating the
Cloudflare Access JWT: every `/api/*` request must carry a
`Cf-Access-Jwt-Assertion` whose `aud` matches the app's AUD tag. `/health` is
left open for health checks.

## 1. Create the Access application

In **Cloudflare dashboard → Zero Trust → Access → Applications**, add a
self-hosted app for your hostname (e.g. `your-app.example.com`) and define the
policies (who may log in). Then copy two values:

- **Application Audience (AUD) Tag** → `CF_ACCESS_AUD`
- Your **team domain** (`<team>.cloudflareaccess.com`) → `CF_ACCESS_TEAM_DOMAIN`

Make sure the tunnel/`cloudflared` route for that hostname points at Traefik
(`http://127.0.0.1:80`), same as the other apps on this host.

## 2. Configure env

```bash
cp .env.example .env
# set GEMINI_API_KEY, CF_ACCESS_AUD, CF_ACCESS_TEAM_DOMAIN
# (BOOK_DOMAIN / CORS_ORIGINS default to your-app.example.com)
```

## 3. Deploy

```bash
# `proxy` network already exists (created by the Traefik stack). If not:
#   docker network create proxy

docker compose -f docker-compose.deploy.yml up -d --build
```

Traefik auto-discovers the frontend via its labels and routes
`Host(your-app.example.com)` to it. The backend stays on the internal network only.

## 4. Verify

```bash
docker compose -f docker-compose.deploy.yml ps          # both healthy

# Without a token the API is rejected (proves auth is on):
curl -i https://your-app.example.com/api/dashboard            # 401/403 via Cloudflare login

# Health stays open:
curl https://your-app.example.com/health                      # {"status":"ok"}
```

> Auth toggle: if `CF_ACCESS_AUD` or `CF_ACCESS_TEAM_DOMAIN` is empty the
> backend lets all requests through (handy for local `docker-compose.yml` dev).
> In this deploy file both must be set or the app is effectively unprotected.
