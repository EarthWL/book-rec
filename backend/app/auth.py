"""Cloudflare Access (Zero Trust) JWT verification.

When an application is protected by Cloudflare Access, Cloudflare injects a
signed JWT into every request via the ``Cf-Access-Jwt-Assertion`` header (and a
``CF_Authorization`` cookie). This module verifies that token:

* signature is RS256 and signed by one of the team's public keys
  (fetched from ``https://<team>.cloudflareaccess.com/cdn-cgi/access/certs``)
* ``aud`` matches the Application Audience (AUD) tag of this app
* ``iss`` matches the team domain
* token is not expired

Configuration (environment variables):
    CF_ACCESS_AUD          Application Audience (AUD) tag from the Access app.
    CF_ACCESS_TEAM_DOMAIN  Team domain, e.g. ``myteam.cloudflareaccess.com``
                           (a bare team name or full https URL also works).

If either value is missing the verifier is disabled (useful for local dev),
and requests are allowed through untouched.
"""

from __future__ import annotations

import os

import jwt
from jwt import PyJWKClient

# Header / cookie Cloudflare Access uses to carry the assertion.
ACCESS_HEADER = "Cf-Access-Jwt-Assertion"
ACCESS_COOKIE = "CF_Authorization"


class CloudflareAccessError(Exception):
    """Raised when a Cloudflare Access token is missing or invalid."""


def _normalize_team_domain(value: str) -> str:
    value = value.strip().rstrip("/")
    if not value:
        return ""
    if not value.startswith("http://") and not value.startswith("https://"):
        value = f"https://{value}"
    return value


class CloudflareAccessVerifier:
    def __init__(self) -> None:
        self.aud = os.getenv("CF_ACCESS_AUD", "").strip()
        self.team_domain = _normalize_team_domain(os.getenv("CF_ACCESS_TEAM_DOMAIN", ""))
        self.enabled = bool(self.aud and self.team_domain)
        self._jwk_client: PyJWKClient | None = None

        if self.enabled:
            certs_url = f"{self.team_domain}/cdn-cgi/access/certs"
            # PyJWKClient caches the JWKS and refreshes it after `lifespan`.
            self._jwk_client = PyJWKClient(certs_url, cache_keys=True, lifespan=3600)

    def verify(self, token: str) -> dict:
        """Verify a Cloudflare Access JWT, returning its claims.

        Raises CloudflareAccessError on any validation failure.
        """
        if not token:
            raise CloudflareAccessError("missing token")
        if self._jwk_client is None:  # pragma: no cover - guarded by enabled
            raise CloudflareAccessError("verifier disabled")
        try:
            signing_key = self._jwk_client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=self.aud,
                issuer=self.team_domain,
                options={"require": ["exp", "iat", "aud", "iss"]},
            )
        except CloudflareAccessError:
            raise
        except Exception as exc:  # PyJWT / JWKS errors
            raise CloudflareAccessError(str(exc)) from exc


verifier = CloudflareAccessVerifier()
