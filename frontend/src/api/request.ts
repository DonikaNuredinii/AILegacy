import { http } from "./http";

export type ApiResult<T> = {
  data: T;
  requestId?: string;
  status: number;
};

export async function postWithMeta<T>(url: string, body: any): Promise<ApiResult<T>> {
  const resp = await http.post<T>(url, body);
  const requestId = resp.headers["x-request-id"];
  return {
    data: resp.data,
    requestId,
    status: resp.status,
  };
}

// ✅ FIX: use same token key + handle non-200 + still works with your existing calls
export async function get<T>(url: string): Promise<T> {
  const token = localStorage.getItem("ailegacy_token"); // <-- was "token"

  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  // If backend returns 404/401, don't silently .json() it
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }

  return res.json();
}
// ✅ NEW: JSON GET using axios instance (auth interceptor applies)
export async function getJson<T>(url: string): Promise<T> {
  const resp = await http.get<T>(url);
  return resp.data;
}

// ✅ NEW: TEXT GET for Prometheus /metrics
export async function getText(url: string): Promise<string> {
  const resp = await http.get(url, { responseType: "text" });
  return String(resp.data);
}