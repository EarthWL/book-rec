import json
import logging
import os
import re
from typing import Any

import httpx

from .schemas import MetadataCandidate

logger = logging.getLogger(__name__)


ISBN_CHARS = re.compile(r"[^0-9Xx]")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
GEMINI_USE_GOOGLE_SEARCH = os.getenv("GEMINI_USE_GOOGLE_SEARCH", "true").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}
GEMINI_REQUIRE_SOURCE = os.getenv("GEMINI_REQUIRE_SOURCE", "true").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}
GEMINI_MIN_CONFIDENCE = float(os.getenv("GEMINI_MIN_CONFIDENCE", "0.75"))
GEMINI_TIMEOUT = float(os.getenv("GEMINI_TIMEOUT", "30"))


def hyphenate_isbn(code: str) -> str:
    normalized = normalize_code(code)
    if len(normalized) == 13 and normalized.startswith(("978616", "979616")):
        return f"{normalized[:3]}-{normalized[3:6]}-{normalized[6:9]}-{normalized[9:12]}-{normalized[12]}"
    return code
VOLUME_PATTERNS = [
    re.compile(r"^(?P<series>.+?)[,\s:.-]+(?:vol(?:ume)?\.?|book)\s*(?P<number>\d+(?:\.\d+)?)\b", re.I),
    re.compile(r"^(?P<series>.+?)\s+เล่ม\s*(?P<number>\d+(?:\.\d+)?)", re.I),
    re.compile(r"^(?P<series>.+?)\s+(?P<number>\d{1,3})$"),
]


def normalize_code(value: str) -> str:
    return ISBN_CHARS.sub("", value).upper()


def split_title(title: str) -> tuple[str, str | None]:
    cleaned = compact_text(title)
    for pattern in VOLUME_PATTERNS:
        match = pattern.search(cleaned)
        if match:
            return match.group("series").strip(" :-,"), match.group("number")
    return cleaned, None


def compact_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def gemini_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "found": {"type": "boolean"},
            "confidence": {"type": "number"},
            "title": {"type": "string"},
            "series_title": {"type": "string"},
            "volume_number": {"type": "string"},
            "authors": {"type": "array", "items": {"type": "string"}},
            "translator": {"type": "string"},
            "illustrator": {"type": "string"},
            "publisher": {"type": "string"},
            "published_date": {"type": "string"},
            "isbn_13": {"type": "string"},
            "isbn_10": {"type": "string"},
            "cover_url": {"type": "string"},
            "source_url": {"type": "string"},
            "source_title": {"type": "string"},
            "notes": {"type": "string"},
        },
        "required": ["found", "confidence"],
    }


def gemini_prompt(code: str) -> str:
    return f"""
Find book or manga metadata for ISBN/barcode {code}.

Return only metadata that is likely to be correct for this exact ISBN. Thai translated manga and light novels are in scope.
If you are not confident the ISBN exists or you cannot identify the exact book, set found=false and use null/empty values.
Do not invent a cover URL.
Use a compact title, preserve Thai text when the book is Thai, and split a visible volume number into volume_number when possible.
""".strip()


def extract_gemini_json(payload: dict[str, Any]) -> dict[str, Any] | None:
    try:
        parts = payload["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError, TypeError):
        return None

    text = "".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
    if not text:
        return None
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def gemini_prompt(code: str) -> str:
    normalized = normalize_code(code)
    hyphenated = hyphenate_isbn(normalized)
    return f"""
Find Thai book, manga, or light novel metadata for this exact ISBN/barcode.

ISBN variants to verify:
- {normalized}
- {hyphenated}

Rules:
- Use web search / grounded sources first. Do not answer from memory.
- The source page or search result must contain the exact ISBN variant above.
- The title, author, publisher, and ISBN must refer to the same book. Do not infer from nearby ISBNs, sequels, previous volumes, covers, or similar titles.
- If you cannot find a source with the exact ISBN, return found=false.
- If sources disagree, prefer official publisher/bookstore/library records that show the exact ISBN on the same page.
- Thai translated manga and light novels are in scope.
- Convert Buddhist Era years to ISO-like CE dates only when the source makes the year clear; otherwise leave published_date empty.
- Do not invent cover_url. Use a cover only when it appears on an exact-ISBN source.
- Include source_url and source_title for the best exact-ISBN source. If no source_url is available, return found=false.
- Return JSON only.
"""


def gemini_grounding_sources(payload: dict[str, Any]) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    for candidate in payload.get("candidates", []):
        metadata = candidate.get("groundingMetadata") or {}
        for chunk in metadata.get("groundingChunks", []):
            web = chunk.get("web") or {}
            uri = web.get("uri")
            if uri:
                sources.append({"uri": uri, "title": web.get("title") or ""})
    return sources


async def lookup_gemini(client: httpx.AsyncClient, code: str) -> list[MetadataCandidate]:
    logger.info(f"lookup_gemini called with code: {code}")
    logger.info(f"GEMINI_API_KEY: {'SET' if GEMINI_API_KEY else 'NOT SET'}")
    logger.info(f"GEMINI_MODEL: {GEMINI_MODEL}")
    logger.info(f"GEMINI_USE_GOOGLE_SEARCH: {GEMINI_USE_GOOGLE_SEARCH}")

    if not GEMINI_API_KEY or not GEMINI_MODEL:
        logger.warning("Gemini API key or model not configured, skipping lookup")
        return []

    # Build request payload with both Google Search and JSON Schema
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": gemini_prompt(code)}]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
            "responseSchema": gemini_schema(),
        },
    }

    # Add Google Search tool if enabled
    if GEMINI_USE_GOOGLE_SEARCH:
        payload["tools"] = [{"google_search": {}}]
        logger.info("Using Google Search + JSON Schema in single request")
    else:
        logger.info("Using JSON Schema only (no Google Search)")

    logger.info(f"Gemini request payload: {json.dumps(payload, indent=2, ensure_ascii=False)}")

    response = await client.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        params={"key": GEMINI_API_KEY},
        json=payload,
    )

    if response.status_code >= 400:
        error_body = response.text
        logger.error(f"Gemini API error response: {error_body}")

    response.raise_for_status()
    response_payload = response.json()

    logger.info(f"Gemini response payload: {json.dumps(response_payload, indent=2, ensure_ascii=False)}")

    parsed = extract_gemini_json(response_payload)
    logger.info(f"Parsed result: {json.dumps(parsed, indent=2, ensure_ascii=False) if parsed else 'None'}")

    if not parsed or not parsed.get("found") or not parsed.get("title"):
        logger.warning(f"Gemini lookup failed: found={parsed.get('found') if parsed else None}, has_title={bool(parsed.get('title')) if parsed else False}")
        return []

    title = compact_text(parsed.get("title"))
    series_title = compact_text(parsed.get("series_title")) or None
    volume_number = compact_text(parsed.get("volume_number")) or None
    if not series_title or not volume_number:
        split_series, split_volume = split_title(title)
        series_title = series_title or split_series
        volume_number = volume_number or split_volume

    authors = parsed.get("authors") if isinstance(parsed.get("authors"), list) else []
    normalized_isbn_13 = normalize_code(parsed.get("isbn_13") or code)
    normalized_isbn_10 = normalize_code(parsed.get("isbn_10") or "")

    note_parts = [
        f"Gemini confidence: {parsed.get('confidence')}",
        compact_text(parsed.get("notes")),
    ]

    candidate = MetadataCandidate(
        provider="Gemini",
        title=title,
        series_title=series_title,
        volume_number=volume_number,
        authors=[compact_text(author) for author in authors if compact_text(author)],
        translator=compact_text(parsed.get("translator")) or None,
        illustrator=compact_text(parsed.get("illustrator")) or None,
        source_url=compact_text(parsed.get("source_url")) or None,
        publisher=compact_text(parsed.get("publisher")) or None,
        published_date=compact_text(parsed.get("published_date")) or None,
        isbn_13=normalized_isbn_13 if len(normalized_isbn_13) == 13 else None,
        isbn_10=normalized_isbn_10 if len(normalized_isbn_10) == 10 else None,
        barcode=code,
        cover_url=compact_text(parsed.get("cover_url")) or None,
        edition=None,
        page_count=None,
        notes="\n".join(part for part in note_parts if part),
    )

    logger.info(f"Gemini lookup successful: {candidate.title} by {', '.join(candidate.authors)}")
    return [candidate]


def dedupe_candidates(candidates: list[MetadataCandidate]) -> list[MetadataCandidate]:
    seen: set[tuple[str | None, str | None, str]] = set()
    unique: list[MetadataCandidate] = []
    for candidate in candidates:
        key = (candidate.isbn_13, candidate.isbn_10, candidate.title.lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(candidate)
    return unique


async def lookup_metadata(code: str) -> list[MetadataCandidate]:
    logger.info(f"lookup_metadata called with code: {code}")
    normalized = normalize_code(code)
    if not normalized:
        logger.warning(f"Failed to normalize code: {code}")
        return []

    logger.info(f"Normalized code: {normalized}")

    # Gemini + Google Search grounding takes ~15-20s per call, so a 7s read timeout
    # turned every grounded lookup into a silent "not found". Allow enough headroom.
    timeout = httpx.Timeout(GEMINI_TIMEOUT, connect=5.0)
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; MangaShelf/0.1; +https://localhost)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
        results: list[MetadataCandidate] = []
        for lookup in (lookup_gemini,):
            try:
                logger.info(f"Calling lookup function: {lookup.__name__}")
                candidates = await lookup(client, normalized)
                logger.info(f"Lookup {lookup.__name__} returned {len(candidates)} candidates")
                results.extend(candidates)
            except httpx.HTTPError as e:
                logger.error(f"HTTP error in {lookup.__name__}: {e}")
                continue
            except Exception as e:
                logger.error(f"Unexpected error in {lookup.__name__}: {e}", exc_info=True)
                continue

    logger.info(f"Total candidates before dedup: {len(results)}")
    deduped = dedupe_candidates(results)
    logger.info(f"Total candidates after dedup: {len(deduped)}")
    return deduped
