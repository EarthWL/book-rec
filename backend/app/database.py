import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
DB_PATH = DATA_DIR / "manga.db"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS series (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                original_title TEXT,
                author TEXT,
                publisher TEXT,
                status TEXT,
                notes TEXT,
                cover_url TEXT,
                normalized_title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS volumes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                volume_number TEXT,
                isbn_13 TEXT,
                isbn_10 TEXT,
                barcode TEXT,
                cover_url TEXT,
                published_date TEXT,
                purchased_at TEXT,
                storage_location TEXT,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_series_normalized_title ON series(normalized_title);
            CREATE INDEX IF NOT EXISTS idx_series_author ON series(author);
            CREATE INDEX IF NOT EXISTS idx_series_publisher ON series(publisher);
            CREATE INDEX IF NOT EXISTS idx_volumes_series_id ON volumes(series_id);
            CREATE INDEX IF NOT EXISTS idx_volumes_title ON volumes(title);
            CREATE INDEX IF NOT EXISTS idx_volumes_volume_number ON volumes(volume_number);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_volumes_isbn_13 ON volumes(isbn_13) WHERE isbn_13 IS NOT NULL AND isbn_13 != '';
            CREATE UNIQUE INDEX IF NOT EXISTS idx_volumes_isbn_10 ON volumes(isbn_10) WHERE isbn_10 IS NOT NULL AND isbn_10 != '';
            CREATE UNIQUE INDEX IF NOT EXISTS idx_volumes_barcode ON volumes(barcode) WHERE barcode IS NOT NULL AND barcode != '';
            """
        )

        # Migration for databases created before the cover_url column existed.
        try:
            conn.execute("SELECT cover_url FROM series LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE series ADD COLUMN cover_url TEXT")
            conn.commit()


def row_to_volume(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "series_id": row["series_id"],
        "series_title": row["series_title"],
        "title": row["title"],
        "volume_number": row["volume_number"],
        "isbn_13": row["isbn_13"],
        "isbn_10": row["isbn_10"],
        "barcode": row["barcode"],
        "cover_url": row["cover_url"],
        "published_date": row["published_date"],
        "purchased_at": row["purchased_at"],
        "storage_location": row["storage_location"],
        "notes": row["notes"],
        "author": row["author"],
        "publisher": row["publisher"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def duplicate_query() -> str:
    return """
        SELECT
            v.*,
            s.title AS series_title,
            s.author AS author,
            s.publisher AS publisher
        FROM volumes v
        JOIN series s ON s.id = v.series_id
        WHERE
            (:isbn_13 != '' AND v.isbn_13 = :isbn_13)
            OR (:isbn_10 != '' AND v.isbn_10 = :isbn_10)
            OR (:barcode != '' AND v.barcode = :barcode)
        ORDER BY v.created_at DESC
    """


def find_duplicates(
    conn: sqlite3.Connection,
    *,
    isbn_13: str | None = None,
    isbn_10: str | None = None,
    barcode: str | None = None,
    exclude_volume_id: int | None = None,
) -> list[dict[str, Any]]:
    rows = conn.execute(
        duplicate_query(),
        {
            "isbn_13": isbn_13 or "",
            "isbn_10": isbn_10 or "",
            "barcode": barcode or "",
        },
    ).fetchall()
    volumes = [row_to_volume(row) for row in rows]
    if exclude_volume_id is not None:
        volumes = [volume for volume in volumes if volume["id"] != exclude_volume_id]
    return volumes


def find_or_create_series(
    conn: sqlite3.Connection,
    *,
    series_id: int | None,
    title: str | None,
    original_title: str | None,
    author: str | None,
    publisher: str | None,
) -> int:
    if series_id:
        existing = conn.execute("SELECT id FROM series WHERE id = ?", (series_id,)).fetchone()
        if existing:
            return int(existing["id"])

    title = (title or "Unknown Series").strip() or "Unknown Series"
    normalized = normalize_text(title)
    author_norm = normalize_text(author)

    rows = conn.execute(
        "SELECT id, author FROM series WHERE normalized_title = ?",
        (normalized,),
    ).fetchall()
    for row in rows:
        if not author_norm or normalize_text(row["author"]) == author_norm:
            return int(row["id"])

    now = utc_now()
    cursor = conn.execute(
        """
        INSERT INTO series (
            title, original_title, author, publisher, status, notes,
            normalized_title, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)
        """,
        (title, original_title, author, publisher, normalized, now, now),
    )
    return int(cursor.lastrowid)


def update_series_cover(conn: sqlite3.Connection, series_id: int) -> None:
    """Update series cover_url from the first volume with a cover"""
    cover_row = conn.execute(
        """
        SELECT cover_url
        FROM volumes
        WHERE series_id = ? AND cover_url IS NOT NULL AND cover_url != ''
        ORDER BY
            CAST(NULLIF(volume_number, '') AS REAL),
            volume_number COLLATE NOCASE,
            created_at
        LIMIT 1
        """,
        (series_id,),
    ).fetchone()

    cover_url = cover_row["cover_url"] if cover_row else None
    conn.execute(
        "UPDATE series SET cover_url = ?, updated_at = ? WHERE id = ?",
        (cover_url, utc_now(), series_id),
    )
