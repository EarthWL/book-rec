import os
import sqlite3
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .auth import ACCESS_COOKIE, ACCESS_HEADER, CloudflareAccessError, verifier
from .database import connect, find_duplicates, find_or_create_series, init_db, row_to_volume, update_series_cover, utc_now
from .metadata import lookup_metadata, normalize_code
from .schemas import (
    DashboardResponse,
    MetadataLookupRequest,
    MetadataLookupResponse,
    SeriesOut,
    VolumeCreate,
    VolumeOut,
    VolumeUpdate,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Manga Shelf API", version="0.1.0", lifespan=lifespan)

origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def cloudflare_access(request: Request, call_next):
    """Enforce a valid Cloudflare Access JWT on every /api/* request.

    `/health` is left open so container/Traefik health checks work without a
    token. When the verifier is disabled (no AUD/team domain configured) all
    requests pass through, which keeps local development frictionless.
    """
    if verifier.enabled and request.url.path.startswith("/api"):
        token = request.headers.get(ACCESS_HEADER) or request.cookies.get(ACCESS_COOKIE)
        if not token:
            return JSONResponse({"detail": "Cloudflare Access token required"}, status_code=401)
        try:
            request.state.cf_identity = await run_in_threadpool(verifier.verify, token)
        except CloudflareAccessError:
            return JSONResponse({"detail": "Invalid Cloudflare Access token"}, status_code=403)
    return await call_next(request)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def get_volume_or_404(conn, volume_id: int) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT
            v.*,
            s.title AS series_title,
            s.author AS author,
            s.publisher AS publisher
        FROM volumes v
        JOIN series s ON s.id = v.series_id
        WHERE v.id = ?
        """,
        (volume_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Volume not found")
    return row_to_volume(row)


def clean_identifier(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = normalize_code(value)
    return cleaned or None


def insert_volume(conn, payload: VolumeCreate) -> dict[str, Any]:
    isbn_13 = clean_identifier(payload.isbn_13)
    isbn_10 = clean_identifier(payload.isbn_10)
    barcode = clean_identifier(payload.barcode)

    duplicates = find_duplicates(conn, isbn_13=isbn_13, isbn_10=isbn_10, barcode=barcode)
    if duplicates:
        raise HTTPException(
            status_code=409,
            detail={"message": "This volume already exists in your collection.", "duplicates": duplicates},
        )

    series_id = find_or_create_series(
        conn,
        series_id=payload.series_id,
        title=payload.series_title,
        original_title=payload.original_title,
        author=payload.author,
        publisher=payload.publisher,
    )
    now = utc_now()
    cursor = conn.execute(
        """
        INSERT INTO volumes (
            series_id, title, volume_number, isbn_13, isbn_10, barcode,
            cover_url, published_date, purchased_at, storage_location, notes,
            created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            series_id,
            payload.title.strip(),
            payload.volume_number,
            isbn_13,
            isbn_10,
            barcode,
            payload.cover_url,
            payload.published_date,
            payload.purchased_at,
            payload.storage_location,
            payload.notes,
            now,
            now,
        ),
    )
    volume_id = int(cursor.lastrowid)
    update_series_cover(conn, series_id)
    return get_volume_or_404(conn, volume_id)


@app.get("/api/dashboard", response_model=DashboardResponse)
def dashboard() -> DashboardResponse:
    with connect() as conn:
        volume_count = conn.execute("SELECT COUNT(*) AS total FROM volumes").fetchone()["total"]
        series_count = conn.execute("SELECT COUNT(*) AS total FROM series").fetchone()["total"]
        rows = conn.execute(
            """
            SELECT
                v.*,
                s.title AS series_title,
                s.author AS author,
                s.publisher AS publisher
            FROM volumes v
            JOIN series s ON s.id = v.series_id
            ORDER BY v.created_at DESC
            LIMIT 8
            """
        ).fetchall()
        return DashboardResponse(
            volume_count=volume_count,
            series_count=series_count,
            recent_additions=[row_to_volume(row) for row in rows],
        )


@app.get("/api/collection", response_model=list[SeriesOut])
def collection(search: str = Query(default="")) -> list[SeriesOut]:
    search_like = f"%{search.strip()}%"
    with connect() as conn:
        if search.strip():
            rows = conn.execute(
                """
                SELECT DISTINCT
                    s.*
                FROM series s
                JOIN volumes v ON v.series_id = s.id
                WHERE
                    s.title LIKE ?
                    OR s.original_title LIKE ?
                    OR s.author LIKE ?
                    OR s.publisher LIKE ?
                    OR v.title LIKE ?
                    OR v.volume_number LIKE ?
                    OR v.isbn_13 LIKE ?
                    OR v.isbn_10 LIKE ?
                    OR v.barcode LIKE ?
                ORDER BY s.title COLLATE NOCASE
                """,
                (search_like,) * 9,
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM series ORDER BY title COLLATE NOCASE").fetchall()

        result: list[SeriesOut] = []
        for series in rows:
            volume_rows = conn.execute(
                """
                SELECT
                    v.*,
                    s.title AS series_title,
                    s.author AS author,
                    s.publisher AS publisher
                FROM volumes v
                JOIN series s ON s.id = v.series_id
                WHERE v.series_id = ?
                ORDER BY
                    CAST(NULLIF(v.volume_number, '') AS REAL),
                    v.volume_number COLLATE NOCASE,
                    v.title COLLATE NOCASE
                """,
                (series["id"],),
            ).fetchall()
            volumes = [row_to_volume(row) for row in volume_rows]
            result.append(
                SeriesOut(
                    id=series["id"],
                    title=series["title"],
                    original_title=series["original_title"],
                    author=series["author"],
                    publisher=series["publisher"],
                    status=series["status"],
                    notes=series["notes"],
                    cover_url=series["cover_url"],
                    volume_count=len(volumes),
                    volumes=volumes,
                )
            )
        return result


@app.get("/api/volumes/{volume_id}", response_model=VolumeOut)
def get_volume(volume_id: int) -> dict[str, Any]:
    with connect() as conn:
        return get_volume_or_404(conn, volume_id)


@app.post("/api/metadata/lookup", response_model=MetadataLookupResponse)
async def metadata_lookup(payload: MetadataLookupRequest) -> MetadataLookupResponse:
    normalized = normalize_code(payload.code)
    with connect() as conn:
        duplicates = find_duplicates(
            conn,
            isbn_13=normalized if len(normalized) == 13 else None,
            isbn_10=normalized if len(normalized) == 10 else None,
            barcode=normalized,
        )
    candidates = await lookup_metadata(normalized)
    return MetadataLookupResponse(
        code=payload.code,
        normalized_code=normalized,
        duplicates=duplicates,
        candidates=candidates,
    )


@app.post("/api/volumes", response_model=VolumeOut, status_code=201)
def create_volume(payload: VolumeCreate) -> dict[str, Any]:
    if not payload.title.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    with connect() as conn:
        try:
            return insert_volume(conn, payload)
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="Duplicate identifier") from exc


@app.put("/api/volumes/{volume_id}", response_model=VolumeOut)
def update_volume(volume_id: int, payload: VolumeUpdate) -> dict[str, Any]:
    with connect() as conn:
        current = get_volume_or_404(conn, volume_id)
        isbn_13 = clean_identifier(payload.isbn_13 if payload.isbn_13 is not None else current["isbn_13"])
        isbn_10 = clean_identifier(payload.isbn_10 if payload.isbn_10 is not None else current["isbn_10"])
        barcode = clean_identifier(payload.barcode if payload.barcode is not None else current["barcode"])
        duplicates = find_duplicates(
            conn,
            isbn_13=isbn_13,
            isbn_10=isbn_10,
            barcode=barcode,
            exclude_volume_id=volume_id,
        )
        if duplicates:
            raise HTTPException(
                status_code=409,
                detail={"message": "Another volume already uses this identifier.", "duplicates": duplicates},
            )

        requested_series_title = payload.series_title if payload.series_title is not None else current["series_title"]
        requested_series_id = payload.series_id if payload.series_id is not None else current["series_id"]
        if requested_series_title and requested_series_title.strip() != current["series_title"]:
            requested_series_id = None

        series_id = find_or_create_series(
            conn,
            series_id=requested_series_id,
            title=requested_series_title,
            original_title=payload.original_title,
            author=payload.author if payload.author is not None else current["author"],
            publisher=payload.publisher if payload.publisher is not None else current["publisher"],
        )
        now = utc_now()
        conn.execute(
            """
            UPDATE volumes
            SET
                series_id = ?,
                title = ?,
                volume_number = ?,
                isbn_13 = ?,
                isbn_10 = ?,
                barcode = ?,
                cover_url = ?,
                published_date = ?,
                purchased_at = ?,
                storage_location = ?,
                notes = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                series_id,
                payload.title if payload.title is not None else current["title"],
                payload.volume_number if payload.volume_number is not None else current["volume_number"],
                isbn_13,
                isbn_10,
                barcode,
                payload.cover_url if payload.cover_url is not None else current["cover_url"],
                payload.published_date if payload.published_date is not None else current["published_date"],
                payload.purchased_at if payload.purchased_at is not None else current["purchased_at"],
                payload.storage_location if payload.storage_location is not None else current["storage_location"],
                payload.notes if payload.notes is not None else current["notes"],
                now,
                volume_id,
            ),
        )
        # Update cover for both old and new series (in case volume was moved)
        old_series_id = current["series_id"]
        if old_series_id != series_id:
            update_series_cover(conn, old_series_id)
        update_series_cover(conn, series_id)
        return get_volume_or_404(conn, volume_id)


@app.delete("/api/volumes/{volume_id}", status_code=204)
def delete_volume(volume_id: int) -> None:
    with connect() as conn:
        volume = get_volume_or_404(conn, volume_id)
        series_id = volume["series_id"]
        conn.execute("DELETE FROM volumes WHERE id = ?", (volume_id,))

        # Check if series still has volumes
        remaining = conn.execute(
            "SELECT COUNT(*) as count FROM volumes WHERE series_id = ?",
            (series_id,),
        ).fetchone()

        if remaining["count"] > 0:
            # Update cover for remaining volumes
            update_series_cover(conn, series_id)
        else:
            # Delete empty series
            conn.execute("DELETE FROM series WHERE id = ?", (series_id,))
