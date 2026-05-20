import type { Dashboard, MetadataLookup, Series, Volume, VolumePayload } from "./types";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    let detail: unknown = response.statusText;
    try {
      detail = await response.json();
    } catch {
      detail = response.statusText;
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : "API request failed");
    this.status = status;
    this.detail = detail;
  }
}

export const api = {
  dashboard: () => request<Dashboard>("/api/dashboard"),
  collection: (search = "") => request<Series[]>(`/api/collection?search=${encodeURIComponent(search)}`),
  lookup: (code: string) =>
    request<MetadataLookup>("/api/metadata/lookup", {
      method: "POST",
      body: JSON.stringify({ code })
    }),
  createVolume: (payload: VolumePayload) =>
    request<Volume>("/api/volumes", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateVolume: (id: number, payload: VolumePayload) =>
    request<Volume>(`/api/volumes/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteVolume: (id: number) =>
    request<void>(`/api/volumes/${id}`, {
      method: "DELETE"
    })
};
