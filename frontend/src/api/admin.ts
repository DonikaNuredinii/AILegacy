import { getJson, postWithMeta } from "./request";

export type AuditRow = {
  id: number;
  timestamp: string;
  user: string;
  method: string;
  path: string;
  status_code: number;
  request_id: string;
  details: string;
};

export type SimState = {
  ai_fail: boolean;
  legacy_delay_ms: number;
};

// ---------- Audit ----------
export async function fetchAudit(): Promise<AuditRow[]> {
  // uses axios instance (auth interceptor applies)
  return await getJson<AuditRow[]>("/admin/audit");
}

// ---------- Simulation ----------
export async function fetchSimState(): Promise<SimState> {
  return await getJson<SimState>("/admin/sim/state");
}

export async function setAiFail(on: boolean): Promise<SimState> {
  const res = await postWithMeta<SimState>(`/admin/sim/ai_fail?on=${on ? 1 : 0}`, {});
  return res.data;
}

export async function setLegacyDelay(ms: number): Promise<SimState> {
  const clamped = Math.max(0, Math.min(ms, 15000));
  const res = await postWithMeta<SimState>(`/admin/sim/legacy_delay?ms=${clamped}`, {});
  return res.data;
}