from pydantic import BaseModel, Field


class SeriesOut(BaseModel):
    id: int
    title: str
    original_title: str | None = None
    author: str | None = None
    publisher: str | None = None
    status: str | None = None
    notes: str | None = None
    cover_url: str | None = None
    volume_count: int | None = None
    volumes: list["VolumeOut"] = Field(default_factory=list)


class VolumeBase(BaseModel):
    series_id: int | None = None
    series_title: str | None = None
    original_title: str | None = None
    author: str | None = None
    publisher: str | None = None
    title: str
    volume_number: str | None = None
    isbn_13: str | None = None
    isbn_10: str | None = None
    barcode: str | None = None
    cover_url: str | None = None
    published_date: str | None = None
    purchased_at: str | None = None
    storage_location: str | None = None
    notes: str | None = None


class VolumeCreate(VolumeBase):
    pass


class VolumeUpdate(VolumeBase):
    title: str | None = None


class VolumeOut(BaseModel):
    id: int
    series_id: int
    series_title: str
    title: str
    volume_number: str | None = None
    isbn_13: str | None = None
    isbn_10: str | None = None
    barcode: str | None = None
    cover_url: str | None = None
    published_date: str | None = None
    purchased_at: str | None = None
    storage_location: str | None = None
    notes: str | None = None
    author: str | None = None
    publisher: str | None = None
    created_at: str
    updated_at: str


class MetadataLookupRequest(BaseModel):
    code: str


class MetadataCandidate(BaseModel):
    provider: str
    title: str
    series_title: str | None = None
    volume_number: str | None = None
    authors: list[str] = Field(default_factory=list)
    translator: str | None = None
    illustrator: str | None = None
    edition: str | None = None
    page_count: str | None = None
    source_url: str | None = None
    notes: str | None = None
    publisher: str | None = None
    published_date: str | None = None
    isbn_13: str | None = None
    isbn_10: str | None = None
    barcode: str | None = None
    cover_url: str | None = None


class MetadataLookupResponse(BaseModel):
    code: str
    normalized_code: str
    duplicates: list[VolumeOut] = Field(default_factory=list)
    candidates: list[MetadataCandidate] = Field(default_factory=list)


class DashboardResponse(BaseModel):
    volume_count: int
    series_count: int
    recent_additions: list[VolumeOut] = Field(default_factory=list)


SeriesOut.model_rebuild()
