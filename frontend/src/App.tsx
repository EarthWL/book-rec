import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import {
  AlertTriangle,
  Barcode,
  BookOpen,
  Camera,
  Check,
  LayoutDashboard,
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
            onEdit={setEditing}
            onDelete={async (volume) => {
              await api.deleteVolume(volume.id);
              await afterMutation("Volume deleted.");
            }}
          />
        </section>
      )}

      {view === "collection" && (
        <section className="page">
          <label className="searchbox">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, series, volume, ISBN, author, publisher"
            />
          </label>
          <Collection series={series} isLoading={isLoading} onEdit={setEditing} onDelete={async (volume) => {
            await api.deleteVolume(volume.id);
            await afterMutation("Volume deleted.");
          }} />
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

      {editing && (
        <EditDialog
          volume={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => afterMutation("Volume updated.")}
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
  onEdit,
  onDelete
}: {
  series: Series[];
  isLoading: boolean;
  onEdit: (volume: Volume) => void;
  onDelete: (volume: Volume) => Promise<void>;
}) {
  if (isLoading) return <p className="empty">Loading collection...</p>;
  if (!series.length) return <p className="empty">No matching volumes.</p>;

  return (
    <div className="series-list">
      {series.map((item) => (
        <section key={item.id} className="series-group">
          <div className="series-heading">
            {item.cover_url && (
              <img src={item.cover_url} alt="" className="series-cover" />
            )}
            <div className="series-info">
              <h2>{item.title}</h2>
              <p>{[item.author, item.publisher].filter(Boolean).join(" - ")}</p>
            </div>
            <span className="series-count">{item.volume_count ?? item.volumes.length}</span>
          </div>
          <VolumeList volumes={item.volumes} onEdit={onEdit} onDelete={onDelete} />
        </section>
      ))}
    </div>
  );
}

function VolumeList({
  volumes,
  isLoading = false,
  onEdit,
  onDelete
}: {
  volumes: Volume[];
  isLoading?: boolean;
  onEdit: (volume: Volume) => void;
  onDelete: (volume: Volume) => Promise<void>;
}) {
  if (isLoading) return <p className="empty">Loading...</p>;
  if (!volumes.length) return <p className="empty">No volumes yet.</p>;

  return (
    <div className="volume-list">
      {volumes.map((volume) => (
        <article key={volume.id} className="volume-card">
          {volume.cover_url ? <img src={volume.cover_url} alt="" /> : <div className="cover-fallback"><BookOpen size={24} /></div>}
          <div className="volume-main">
            <h3>{volume.title}</h3>
            <p>
              {volume.series_title}
              {volume.volume_number ? ` vol. ${volume.volume_number}` : ""}
            </p>
            <small>{[volume.isbn_13 || volume.isbn_10 || volume.barcode, volume.storage_location].filter(Boolean).join(" - ")}</small>
          </div>
          <div className="volume-actions">
            <button className="ghost icon-only" onClick={() => onEdit(volume)} aria-label="Edit volume">
              <Pencil size={18} />
            </button>
            <button
              className="ghost danger icon-only"
              onClick={() => {
                if (window.confirm("Delete this volume?")) {
                  onDelete(volume).catch(() => undefined);
                }
              }}
              aria-label="Delete volume"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </article>
      ))}
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

export default App;
