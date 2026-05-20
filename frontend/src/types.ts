export type Volume = {
  id: number;
  series_id: number;
  series_title: string;
  title: string;
  volume_number?: string | null;
  isbn_13?: string | null;
  isbn_10?: string | null;
  barcode?: string | null;
  cover_url?: string | null;
  published_date?: string | null;
  purchased_at?: string | null;
  storage_location?: string | null;
  notes?: string | null;
  author?: string | null;
  publisher?: string | null;
  created_at: string;
  updated_at: string;
};

export type Series = {
  id: number;
  title: string;
  original_title?: string | null;
  author?: string | null;
  publisher?: string | null;
  status?: string | null;
  notes?: string | null;
  cover_url?: string | null;
  volume_count?: number | null;
  volumes: Volume[];
};

export type Dashboard = {
  volume_count: number;
  series_count: number;
  recent_additions: Volume[];
};

export type MetadataCandidate = {
  provider: string;
  title: string;
  series_title?: string | null;
  volume_number?: string | null;
  authors: string[];
  translator?: string | null;
  illustrator?: string | null;
  edition?: string | null;
  page_count?: string | null;
  source_url?: string | null;
  notes?: string | null;
  publisher?: string | null;
  published_date?: string | null;
  isbn_13?: string | null;
  isbn_10?: string | null;
  barcode?: string | null;
  cover_url?: string | null;
};

export type MetadataLookup = {
  code: string;
  normalized_code: string;
  duplicates: Volume[];
  candidates: MetadataCandidate[];
};

export type VolumePayload = {
  series_id?: number | null;
  series_title?: string | null;
  original_title?: string | null;
  author?: string | null;
  publisher?: string | null;
  title: string;
  volume_number?: string | null;
  isbn_13?: string | null;
  isbn_10?: string | null;
  barcode?: string | null;
  cover_url?: string | null;
  published_date?: string | null;
  purchased_at?: string | null;
  storage_location?: string | null;
  notes?: string | null;
};
