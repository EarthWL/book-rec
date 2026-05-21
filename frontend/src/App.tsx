import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import {
  AlertTriangle,
  Barcode,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  LayoutDashboard,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  Trash2,
  X
} from "lucide-react";
import { ApiError, api } from "./api";
import type { Dashboard, MetadataCandidate, MetadataLookup, Series, Volume, VolumePayload } from "./types";

type View = "dashboard" | "collection" | "add";
type AddStep = "entry" | "review";
type Detail = { kind: "volume"; volume: Volume } | { kind: "series"; series: Series };
type Layout = "list" | "grid";

const emptyPayload: VolumePayload = {
  title: "",
  series_title: "",
  volume_number: "",
  isbn_13: "",
  isbn_10: "",
  barcode: "",
  author: "",
  publisher: "",
  cover_url: "",
  published_date: "",
  purchased_at: new Date().toISOString().slice(0, 10),
  storage_location: "",
  notes: ""
};

function candidateToPayload(candidate: MetadataCandidate, scannedCode: string): VolumePayload {
  const noteParts = [
    candidate.translator ? `Translator: ${candidate.translator}` : "",
    candidate.illustrator ? `Illustrator: ${candidate.illustrator}` : "",
    candidate.edition ? `Edition: ${candidate.edition}` : "",
    candidate.page_count ? `Pages: ${candidate.page_count}` : "",
    candidate.source_url ? `Source: ${candidate.source_url}` : "",
    candidate.notes || ""
  ].filter(Boolean);

  return {
    title: candidate.title,
    series_title: candidate.series_title || candidate.title,
    volume_number: candidate.volume_number || "",
    isbn_13: candidate.isbn_13 || "",
    isbn_10: candidate.isbn_10 || "",
    barcode: candidate.barcode || scannedCode,
    author: candidate.authors.join(", "),
    publisher: candidate.publisher || "",
    cover_url: candidate.cover_url || "",
    published_date: candidate.published_date || "",
    purchased_at: new Date().toISOString().slice(0, 10),
    storage_location: "",
    notes: noteParts.join("\n")
  };
}

function fallbackPayload(code: string): VolumePayload {
  const normalized = code.replace(/[^0-9Xx]/g, "").toUpperCase();
  return {
    ...emptyPayload,
    title: "",
    series_title: "",
    isbn_13: normalized.length === 13 ? normalized : "",
    isbn_10: normalized.length === 10 ? normalized : "",
    barcode: normalized
  };
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (typeof error.detail === "object" && error.detail && "detail" in error.detail) {
      const detail = (error.detail as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (typeof detail === "object" && detail && "message" in detail) {
        return String((detail as { message: unknown }).message);
      }
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

function App() {
  const [view, setView] = useState<View>("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Volume | null>(null);
  const [adding, setAdding] = useState<Series | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [layout, setLayout] = useState<Layout>("list");

  async function deleteVolume(volume: Volume) {
    await api.deleteVolume(volume.id);
    setDetail(null);
    await afterMutation("Volume deleted.");
  }

  function startEdit(volume: Volume) {
    setDetail(null);
    setEditing(volume);
  }

  function startAddVolume(series: Series) {
    setDetail(null);
    setAdding(series);
  }

  async function refresh() {
    setIsLoading(true);
    try {
      const [dashboardData, collectionData] = await Promise.all([api.dashboard(), api.collection(search)]);
      setDashboard(dashboardData);
      setSeries(collectionData);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch((error) => setMessage(errorText(error)));
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      api.collection(search).then(setSeries).catch((error) => setMessage(errorText(error)));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [search]);

  async function afterMutation(success: string) {
    setMessage(success);
    setEditing(null);
    setAdding(null);
    await refresh();
  }

  const ownedVolumeLabel = dashboard?.volume_count === 1 ? "volume" : "volumes";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Manga Shelf</p>
          <h1>Purchase check</h1>
        </div>
        <button className="primary icon-text" onClick={() => setView("add")}>
          <Plus size={18} />
          Add Manga
        </button>
      </header>

      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button className="ghost icon-only" onClick={() => setMessage("")} aria-label="Dismiss">
            <X size={18} />
          </button>
        </div>
      )}

      <nav className="tabs" aria-label="Primary">
        <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
          <LayoutDashboard size={17} />
          Dashboard
        </button>
        <button className={view === "collection" ? "active" : ""} onClick={() => setView("collection")}>
          <BookOpen size={17} />
          Collection
        </button>
        <button className={view === "add" ? "active" : ""} onClick={() => setView("add")}>
          <Barcode size={17} />
          Add
        </button>
      </nav>

      {view === "dashboard" && (
        <section className="page">
          <div className="stats">
            <div>
              <span>{dashboard?.volume_count ?? 0}</span>
              <p>{ownedVolumeLabel}</p>
            </div>
            <div>
              <span>{dashboard?.series_count ?? 0}</span>
              <p>series</p>
            </div>
          </div>
          <div className="section-header">
            <h2>Recent additions</h2>
            <button className="secondary icon-text" onClick={() => setView("collection")}>
              <Search size={17} />
              Search
            </button>
          </div>
          <VolumeList
            volumes={dashboard?.recent_additions ?? []}
            isLoading={isLoading}
            onView={(volume) => setDetail({ kind: "volume", volume })}
          />
        </section>
      )}

      {view === "collection" && (
        <section className="page">
          <div className="collection-toolbar">
            <label className="searchbox">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, series, volume, ISBN, author, publisher"
              />
            </label>
            <div className="layout-toggle" role="group" aria-label="Layout">
              <button
                className={`icon-only ${layout === "list" ? "active" : "ghost"}`}
                onClick={() => setLayout("list")}
                aria-pressed={layout === "list"}
                aria-label="List view"
              >
                <List size={18} />
              </button>
              <button
                className={`icon-only ${layout === "grid" ? "active" : "ghost"}`}
                onClick={() => setLayout("grid")}
                aria-pressed={layout === "grid"}
                aria-label="Grid view"
              >
                <LayoutGrid size={18} />
              </button>
            </div>
          </div>
          <Collection
            series={series}
            isLoading={isLoading}
            layout={layout}
            onView={(volume) => setDetail({ kind: "volume", volume })}
            onViewSeries={(item) => setDetail({ kind: "series", series: item })}
          />
        </section>
      )}

      {view === "add" && (
        <AddManga
          onSaved={async () => {
            await afterMutation("Volume saved.");
            setView("collection");
          }}
          onMessage={setMessage}
        />
      )}

      {detail?.kind === "volume" && (
        <VolumeDetail
          volume={detail.volume}
          onClose={() => setDetail(null)}
          onEdit={startEdit}
          onDelete={deleteVolume}
        />
      )}

      {detail?.kind === "series" && (
        <SeriesDetail
          series={detail.series}
          onClose={() => setDetail(null)}
          onView={(volume) => setDetail({ kind: "volume", volume })}
          onAddVolume={startAddVolume}
        />
      )}

      {editing && (
        <EditDialog
          volume={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => afterMutation("Volume updated.")}
          onMessage={setMessage}
        />
      )}

      {adding && (
        <AddVolumeDialog
          series={adding}
          onClose={() => setAdding(null)}
          onSaved={async () => afterMutation("Volume added.")}
          onMessage={setMessage}
        />
      )}
    </main>
  );
}

function AddManga({ onSaved, onMessage }: { onSaved: () => Promise<void>; onMessage: (value: string) => void }) {
  const [step, setStep] = useState<AddStep>("entry");
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<MetadataLookup | null>(null);
  const [payload, setPayload] = useState<VolumePayload>(emptyPayload);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function runLookup(nextCode = code) {
    const trimmed = nextCode.trim();
    if (!trimmed) {
      onMessage("Enter or scan a barcode first.");
      return;
    }
    setIsLookingUp(true);
    try {
      const result = await api.lookup(trimmed);
      setLookup(result);
      const nextPayload = result.candidates[0]
        ? candidateToPayload(result.candidates[0], result.normalized_code)
        : fallbackPayload(result.normalized_code);
      setPayload(nextPayload);
      setStep("review");
      if (result.duplicates.length) {
        onMessage("Duplicate warning: this identifier is already in your collection.");
      }
    } catch (error) {
      onMessage(errorText(error));
    } finally {
      setIsLookingUp(false);
    }
  }

  async function save() {
    if (!payload.title.trim()) {
      onMessage("Title is required before saving.");
      return;
    }
    setIsSaving(true);
    try {
      await api.createVolume(payload);
      setStep("entry");
      setCode("");
      setLookup(null);
      setPayload(emptyPayload);
      await onSaved();
    } catch (error) {
      onMessage(errorText(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="page add-flow">
      {step === "entry" && (
        <>
          <Scanner
            onDetected={(value) => {
              setCode(value);
              runLookup(value).catch((error) => onMessage(errorText(error)));
            }}
            onMessage={onMessage}
          />
          <div className="manual-entry">
            <label>
              ISBN or barcode
              <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
            </label>
            <button className="primary full icon-text" disabled={isLookingUp} onClick={() => runLookup()}>
              <Search size={18} />
              {isLookingUp ? "Looking up..." : "Lookup"}
            </button>
          </div>
        </>
      )}

      {step === "review" && lookup && (
        <>
          {lookup.duplicates.length > 0 && <DuplicateWarning duplicates={lookup.duplicates} />}
          {lookup.candidates.length > 1 && (
            <div className="candidate-strip">
              {lookup.candidates.map((candidate) => (
                <button
                  key={`${candidate.provider}-${candidate.title}-${candidate.isbn_13 ?? candidate.isbn_10 ?? ""}`}
                  className="candidate"
                  onClick={() => setPayload(candidateToPayload(candidate, lookup.normalized_code))}
                >
                  <span>{candidate.provider}</span>
                  {candidate.title}
                </button>
              ))}
            </div>
          )}
          <VolumeForm payload={payload} onChange={setPayload} />
          <div className="actions">
            <button className="secondary icon-text" onClick={() => setStep("entry")}>
              <Camera size={18} />
              Scan again
            </button>
            <button className="primary icon-text" disabled={isSaving} onClick={save}>
              <Check size={18} />
              {isSaving ? "Saving..." : "Save volume"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Scanner({ onDetected, onMessage }: { onDetected: (value: string) => void; onMessage: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!enabled || !videoRef.current) return;
    let cancelled = false;
    setIsStarting(true);
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) {
          controlsRef.current?.stop();
          setEnabled(false);
          onDetected(result.getText());
        }
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch(() => onMessage("Camera scanning is unavailable. Use manual entry."))
      .finally(() => setIsStarting(false));

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [enabled, onDetected, onMessage]);

  return (
    <div className="scanner">
      <video ref={videoRef} className={enabled ? "visible" : ""} muted playsInline />
      {!enabled && (
        <button className="scan-button" onClick={() => setEnabled(true)}>
          <Camera size={32} />
          Scan barcode
        </button>
      )}
      {isStarting && <p className="scanner-status">Starting camera...</p>}
    </div>
  );
}

function DuplicateWarning({ duplicates }: { duplicates: Volume[] }) {
  return (
    <div className="duplicate" role="alert">
      <AlertTriangle size={24} />
      <div>
        <strong>Already owned</strong>
        {duplicates.map((volume) => (
          <p key={volume.id}>
            {volume.series_title} {volume.volume_number ? `vol. ${volume.volume_number}` : ""} - {volume.title}
          </p>
        ))}
      </div>
    </div>
  );
}

function VolumeForm({ payload, onChange }: { payload: VolumePayload; onChange: (payload: VolumePayload) => void }) {
  function setField<K extends keyof VolumePayload>(key: K, value: VolumePayload[K]) {
    onChange({ ...payload, [key]: value });
  }

  return (
    <div className="form-grid">
      {payload.cover_url && (
        <div className="cover-preview">
          <img src={payload.cover_url} alt="" />
        </div>
      )}
      <label>
        Series
        <input value={payload.series_title ?? ""} onChange={(event) => setField("series_title", event.target.value)} />
      </label>
      <label>
        Volume title
        <input value={payload.title} onChange={(event) => setField("title", event.target.value)} />
      </label>
      <label>
        Volume number
        <input value={payload.volume_number ?? ""} onChange={(event) => setField("volume_number", event.target.value)} />
      </label>
      <label>
        Author
        <input value={payload.author ?? ""} onChange={(event) => setField("author", event.target.value)} />
      </label>
      <label>
        Publisher
        <input value={payload.publisher ?? ""} onChange={(event) => setField("publisher", event.target.value)} />
      </label>
      <label>
        ISBN-13
        <input value={payload.isbn_13 ?? ""} onChange={(event) => setField("isbn_13", event.target.value)} />
      </label>
      <label>
        ISBN-10
        <input value={payload.isbn_10 ?? ""} onChange={(event) => setField("isbn_10", event.target.value)} />
      </label>
      <label>
        Barcode
        <input value={payload.barcode ?? ""} onChange={(event) => setField("barcode", event.target.value)} />
      </label>
      <label>
        Published
        <input value={payload.published_date ?? ""} onChange={(event) => setField("published_date", event.target.value)} />
      </label>
      <label>
        Purchased
        <input type="date" value={payload.purchased_at ?? ""} onChange={(event) => setField("purchased_at", event.target.value)} />
      </label>
      <label>
        Storage
        <input value={payload.storage_location ?? ""} onChange={(event) => setField("storage_location", event.target.value)} />
      </label>
      <label className="wide">
        Cover URL
        <input value={payload.cover_url ?? ""} onChange={(event) => setField("cover_url", event.target.value)} />
      </label>
      <label className="wide">
        Notes
        <textarea value={payload.notes ?? ""} onChange={(event) => setField("notes", event.target.value)} />
      </label>
    </div>
  );
}

function Collection({
  series,
  isLoading,
  layout,
  onView,
  onViewSeries
}: {
  series: Series[];
  isLoading: boolean;
  layout: Layout;
  onView: (volume: Volume) => void;
  onViewSeries: (series: Series) => void;
}) {
  if (isLoading) return <p className="empty">Loading collection...</p>;
  if (!series.length) return <p className="empty">No matching volumes.</p>;

  return (
    <div className="series-list">
      {series.map((item) => (
        <section key={item.id} className="series-group">
          <div
            className="series-heading clickable"
            role="button"
            tabIndex={0}
            onClick={() => onViewSeries(item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onViewSeries(item);
              }
            }}
          >
            {item.cover_url && (
              <img src={item.cover_url} alt="" className="series-cover" />
            )}
            <div className="series-info">
              <h2>{item.title}</h2>
              <p>{[item.author, item.publisher].filter(Boolean).join(" - ")}</p>
            </div>
            <span className="series-count">{item.volume_count ?? item.volumes.length}</span>
          </div>
          {layout === "grid" ? (
            <VolumeGrid volumes={item.volumes} onView={onView} />
          ) : (
            <VolumeList volumes={item.volumes} onView={onView} />
          )}
        </section>
      ))}
    </div>
  );
}

function VolumeGrid({ volumes, onView }: { volumes: Volume[]; onView: (volume: Volume) => void }) {
  if (!volumes.length) return <p className="empty">No volumes yet.</p>;

  return (
    <div className="volume-grid">
      {volumes.map((volume) => (
        <button
          key={volume.id}
          className="volume-tile"
          onClick={() => onView(volume)}
          title={volume.title}
        >
          {volume.cover_url ? (
            <img src={volume.cover_url} alt="" />
          ) : (
            <div className="cover-fallback"><BookOpen size={24} /></div>
          )}
          <span className="volume-tile-label">
            {volume.volume_number ? `vol. ${volume.volume_number}` : volume.title}
          </span>
        </button>
      ))}
    </div>
  );
}

function VolumeList({
  volumes,
  isLoading = false,
  onView
}: {
  volumes: Volume[];
  isLoading?: boolean;
  onView: (volume: Volume) => void;
}) {
  if (isLoading) return <p className="empty">Loading...</p>;
  if (!volumes.length) return <p className="empty">No volumes yet.</p>;

  return (
    <div className="volume-list">
      {volumes.map((volume) => (
        <article
          key={volume.id}
          className="volume-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => onView(volume)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onView(volume);
            }
          }}
        >
          {volume.cover_url ? <img src={volume.cover_url} alt="" /> : <div className="cover-fallback"><BookOpen size={24} /></div>}
          <div className="volume-main">
            <h3>{volume.title}</h3>
            <p>
              {volume.series_title}
              {volume.volume_number ? ` vol. ${volume.volume_number}` : ""}
            </p>
            <small>{[volume.isbn_13 || volume.isbn_10 || volume.barcode, volume.storage_location].filter(Boolean).join(" - ")}</small>
          </div>
          <ChevronRight className="volume-chevron" size={18} />
        </article>
      ))}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function VolumeDetail({
  volume,
  onClose,
  onEdit,
  onDelete
}: {
  volume: Volume;
  onClose: () => void;
  onEdit: (volume: Volume) => void;
  onDelete: (volume: Volume) => Promise<void>;
}) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <h2>Volume details</h2>
          <button className="ghost icon-only" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="detail-hero">
          {volume.cover_url ? (
            <img src={volume.cover_url} alt="" />
          ) : (
            <div className="cover-fallback"><BookOpen size={28} /></div>
          )}
          <div>
            <h3>{volume.title}</h3>
            <p>
              {volume.series_title}
              {volume.volume_number ? ` vol. ${volume.volume_number}` : ""}
            </p>
          </div>
        </div>

        <dl className="detail-list">
          <DetailRow label="Series" value={volume.series_title} />
          <DetailRow label="Volume" value={volume.volume_number} />
          <DetailRow label="Author" value={volume.author} />
          <DetailRow label="Publisher" value={volume.publisher} />
          <DetailRow label="ISBN-13" value={volume.isbn_13} />
          <DetailRow label="ISBN-10" value={volume.isbn_10} />
          <DetailRow label="Barcode" value={volume.barcode} />
          <DetailRow label="Published" value={volume.published_date} />
          <DetailRow label="Purchased" value={volume.purchased_at} />
          <DetailRow label="Storage" value={volume.storage_location} />
          <DetailRow label="Notes" value={volume.notes} />
        </dl>

        <div className="actions">
          <button
            className="ghost danger icon-text"
            onClick={() => {
              if (window.confirm("Delete this volume?")) {
                onDelete(volume).catch(() => undefined);
              }
            }}
          >
            <Trash2 size={18} />
            Delete
          </button>
          <button className="primary icon-text" onClick={() => onEdit(volume)}>
            <Pencil size={18} />
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function SeriesDetail({
  series,
  onClose,
  onView,
  onAddVolume
}: {
  series: Series;
  onClose: () => void;
  onView: (volume: Volume) => void;
  onAddVolume: (series: Series) => void;
}) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <h2>Series details</h2>
          <button className="ghost icon-only" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="detail-hero">
          {series.cover_url ? (
            <img src={series.cover_url} alt="" />
          ) : (
            <div className="cover-fallback"><BookOpen size={28} /></div>
          )}
          <div>
            <h3>{series.title}</h3>
            <p>{[series.author, series.publisher].filter(Boolean).join(" - ")}</p>
          </div>
        </div>

        <dl className="detail-list">
          <DetailRow label="Original title" value={series.original_title} />
          <DetailRow label="Author" value={series.author} />
          <DetailRow label="Publisher" value={series.publisher} />
          <DetailRow label="Status" value={series.status} />
          <DetailRow label="Volumes owned" value={String(series.volume_count ?? series.volumes.length)} />
          <DetailRow label="Notes" value={series.notes} />
        </dl>

        <div className="detail-subhead-row">
          <h3 className="detail-subhead">Volumes</h3>
          <button className="secondary icon-text" onClick={() => onAddVolume(series)}>
            <Plus size={16} />
            Add volume
          </button>
        </div>
        <VolumeList volumes={series.volumes} onView={onView} />
      </div>
    </div>
  );
}

function EditDialog({
  volume,
  onClose,
  onSaved,
  onMessage
}: {
  volume: Volume;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onMessage: (value: string) => void;
}) {
  const initial = useMemo<VolumePayload>(
    () => ({
      series_id: volume.series_id,
      series_title: volume.series_title,
      title: volume.title,
      volume_number: volume.volume_number ?? "",
      isbn_13: volume.isbn_13 ?? "",
      isbn_10: volume.isbn_10 ?? "",
      barcode: volume.barcode ?? "",
      cover_url: volume.cover_url ?? "",
      published_date: volume.published_date ?? "",
      purchased_at: volume.purchased_at ?? "",
      storage_location: volume.storage_location ?? "",
      notes: volume.notes ?? "",
      author: volume.author ?? "",
      publisher: volume.publisher ?? ""
    }),
    [volume]
  );
  const [payload, setPayload] = useState<VolumePayload>(initial);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setIsSaving(true);
    try {
      await api.updateVolume(volume.id, payload);
      await onSaved();
    } catch (error) {
      onMessage(errorText(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog">
        <div className="dialog-header">
          <h2>Edit volume</h2>
          <button className="ghost icon-only" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <VolumeForm payload={payload} onChange={setPayload} />
        <div className="actions">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary icon-text" disabled={isSaving} onClick={save}>
            <Check size={18} />
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Build a payload for a new volume by carrying over the series-wide info from
// the latest volume and suggesting the next volume number / title. Volume-
// specific fields (identifiers, published date, cover) are left blank for the
// user to fill in.
function nextVolumePayload(series: Series): VolumePayload {
  const volumes = series.volumes ?? [];
  const template = volumes.reduce<Volume | undefined>((best, volume) => {
    const current = parseInt((volume.volume_number ?? "").replace(/\D/g, ""), 10);
    if (Number.isNaN(current)) return best;
    const bestNum = best ? parseInt((best.volume_number ?? "").replace(/\D/g, ""), 10) : -Infinity;
    return current >= bestNum ? volume : best;
  }, volumes[volumes.length - 1]);

  const rawNumber = template?.volume_number ?? "";
  const digits = rawNumber.match(/\d+/)?.[0] ?? "";
  let nextNumber = "";
  if (digits) {
    nextNumber = String(parseInt(digits, 10) + 1).padStart(digits.length, "0");
  }

  let nextTitle = "";
  if (template?.title && digits && nextNumber) {
    const index = template.title.lastIndexOf(digits);
    nextTitle =
      index >= 0
        ? template.title.slice(0, index) + nextNumber + template.title.slice(index + digits.length)
        : "";
  }

  return {
    series_id: series.id,
    series_title: series.title,
    author: series.author ?? template?.author ?? "",
    publisher: series.publisher ?? template?.publisher ?? "",
    storage_location: template?.storage_location ?? "",
    title: nextTitle,
    volume_number: nextNumber,
    isbn_13: "",
    isbn_10: "",
    barcode: "",
    cover_url: "",
    published_date: "",
    purchased_at: new Date().toISOString().slice(0, 10),
    notes: ""
  };
}

function AddVolumeDialog({
  series,
  onClose,
  onSaved,
  onMessage
}: {
  series: Series;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onMessage: (value: string) => void;
}) {
  const [payload, setPayload] = useState<VolumePayload>(() => nextVolumePayload(series));
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    if (!payload.title.trim()) {
      onMessage("Title is required before saving.");
      return;
    }
    setIsSaving(true);
    try {
      await api.createVolume(payload);
      await onSaved();
    } catch (error) {
      onMessage(errorText(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog">
        <div className="dialog-header">
          <h2>Add volume to {series.title}</h2>
          <button className="ghost icon-only" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <VolumeForm payload={payload} onChange={setPayload} />
        <div className="actions">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary icon-text" disabled={isSaving} onClick={save}>
            <Check size={18} />
            {isSaving ? "Saving..." : "Save volume"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
