// src/pages/ObservabilityPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { getJson, getText } from "../api/request";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type AuditItem = {
  timestamp: string;
  user: string;
  path: string;
  status_code: number;
  request_id: string;
  details?: string;
};

type MetricsSnapshot = {
  ts: number;

  totalRequests: number;
  err4xx: number;
  err5xx: number;

  durationSumSec: number;
  durationCount: number;

  avgLatencyMs: number;
  errorRatePct: number;
  serverErrorPct: number;

  rps: number;
};

function safeNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parses Prometheus text format and extracts:
 * - total requests (cumulative)
 * - 4xx count, 5xx count
 * - duration sum/count (prefer highr if present)
 */
function parsePrometheusMetrics(text: string) {
  const lines = text.split("\n");

  let total = 0;
  let s4xx = 0;
  let s5xx = 0;

  // We'll store ONLY one series:
  // Prefer http_request_duration_highr_seconds_{sum,count}
  // If not present, fallback to sum/count aggregated by handler.
  let durSumHighr: number | null = null;
  let durCountHighr: number | null = null;

  let durSumFallback = 0;
  let durCountFallback = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    // Total requests by status group
    if (line.startsWith("http_requests_total")) {
      const m = line.match(
        /http_requests_total\{[^}]*status="([^"]+)"[^}]*\}\s+([0-9.eE+-]+)/
      );
      if (m) {
        const statusGroup = m[1]; // e.g. "2xx", "4xx", "5xx"
        const val = safeNum(m[2]);
        total += val;

        // ✅ safer: mutually exclusive
        if (statusGroup.startsWith("4")) s4xx += val;
        else if (statusGroup.startsWith("5")) s5xx += val;
      }
      continue;
    }

    // Preferred: high-resolution latency
    if (line.startsWith("http_request_duration_highr_seconds_sum")) {
      const m = line.match(
        /http_request_duration_highr_seconds_sum\s+([0-9.eE+-]+)/
      );
      if (m) durSumHighr = safeNum(m[1]);
      continue;
    }

    if (line.startsWith("http_request_duration_highr_seconds_count")) {
      const m = line.match(
        /http_request_duration_highr_seconds_count\s+([0-9.eE+-]+)/
      );
      if (m) durCountHighr = safeNum(m[1]);
      continue;
    }

    // ✅ fallback ONLY if highr not present (we decide at end)
    if (line.startsWith("http_request_duration_seconds_sum")) {
      const m = line.match(
        /http_request_duration_seconds_sum\{[^}]*\}\s+([0-9.eE+-]+)/
      );
      if (m) durSumFallback += safeNum(m[1]);
      continue;
    }

    if (line.startsWith("http_request_duration_seconds_count")) {
      const m = line.match(
        /http_request_duration_seconds_count\{[^}]*\}\s+([0-9.eE+-]+)/
      );
      if (m) durCountFallback += safeNum(m[1]);
      continue;
    }
  }

  const useHighr =
    durSumHighr !== null &&
    durCountHighr !== null &&
    durCountHighr > 0;

  const durationSumSec = useHighr ? durSumHighr! : durSumFallback;
  const durationCount = useHighr ? durCountHighr! : durCountFallback;

  return {
    totalRequests: Math.round(total),
    err4xx: Math.round(s4xx),
    err5xx: Math.round(s5xx),
    durationSumSec,
    durationCount,
  };
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toneForStatus(code: number) {
  if (code >= 500) return "red" as const;
  if (code >= 400) return "amber" as const;
  return "green" as const;
}

function prettyDetails(details?: string) {
  if (!details) return "";
  try {
    const obj = JSON.parse(details);
    return JSON.stringify(obj, null, 2);
  } catch {
    return details;
  }
}

// ✅ (4) Trace helpers
function tryParse(details?: string): any | null {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
}
function fmtMs(x?: any) {
  const n = Number(x);
  return Number.isFinite(n) ? `${n.toFixed(1)} ms` : "-";
}
function pct(x?: any) {
  const n = Number(x);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : "-";
}

export default function ObservabilityPage() {
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [metricsText, setMetricsText] = useState<string>("");

  const [statusFilter, setStatusFilter] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [requestIdFilter, setRequestIdFilter] = useState("");

  const [err, setErr] = useState<string | null>(null);

  const [history, setHistory] = useState<MetricsSnapshot[]>([]);
  const lastRef = useRef<MetricsSnapshot | null>(null);

  const [selected, setSelected] = useState<AuditItem | null>(null);

  async function loadAudit() {
    const data = await getJson<AuditItem[]>("/admin/audit");
    setAudit(data);
  }

  async function loadMetrics() {
    const text = await getText("/metrics");
    setMetricsText(text);

    const parsed = parsePrometheusMetrics(text);

    const now = Date.now();
    const avgLatencyMs =
      parsed.durationCount > 0
        ? (parsed.durationSumSec / parsed.durationCount) * 1000
        : 0;

    const total = parsed.totalRequests || 0;
    const errAll = (parsed.err4xx || 0) + (parsed.err5xx || 0);

    const errorRatePct = total > 0 ? (errAll / total) * 100 : 0;
    const serverErrorPct = total > 0 ? ((parsed.err5xx || 0) / total) * 100 : 0;

    const prev = lastRef.current;
    let rps = 0;
    if (prev) {
      const dtSec = Math.max(0.001, (now - prev.ts) / 1000);
      const dTotal = Math.max(0, total - prev.totalRequests);
      rps = dTotal / dtSec;
    }

    const snap: MetricsSnapshot = {
      ts: now,
      totalRequests: total,
      err4xx: parsed.err4xx || 0,
      err5xx: parsed.err5xx || 0,
      durationSumSec: parsed.durationSumSec || 0,
      durationCount: parsed.durationCount || 0,
      avgLatencyMs,
      errorRatePct,
      serverErrorPct,
      rps,
    };

    lastRef.current = snap;

    setHistory((h) => {
      const next = [...h, snap];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }

  async function refreshAll() {
    setErr(null);
    try {
      await Promise.all([loadAudit(), loadMetrics()]);
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? e?.message ?? "Request failed");
    }
  }

  useEffect(() => {
    refreshAll();

    const id = window.setInterval(() => {
      loadMetrics().catch(() => {});
    }, 5000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredAudit = useMemo(() => {
    return audit.filter((item) => {
      const statusMatch = statusFilter
        ? item.status_code.toString().startsWith(statusFilter)
        : true;

      const pathMatch = pathFilter
        ? item.path.toLowerCase().includes(pathFilter.toLowerCase())
        : true;

      const reqMatch = requestIdFilter
        ? item.request_id.toLowerCase().includes(requestIdFilter.toLowerCase())
        : true;

      return statusMatch && pathMatch && reqMatch;
    });
  }, [audit, statusFilter, pathFilter, requestIdFilter]);

  const latest = history.length ? history[history.length - 1] : null;

  const chartData = useMemo(() => {
    return history.map((h) => ({
      time: formatTime(h.ts),
      latencyMs: Number(h.avgLatencyMs.toFixed(1)),
      errorPct: Number(h.errorRatePct.toFixed(2)),
      serverErrorPct: Number(h.serverErrorPct.toFixed(2)),
      rps: Number(h.rps.toFixed(2)),
    }));
  }, [history]);

  function copyMetrics() {
    navigator.clipboard.writeText(metricsText || "");
  }

  function copyText(x: string) {
    navigator.clipboard.writeText(x);
  }

  // ✅ Trace computed
  const trace = selected ? tryParse(selected.details) : null;
  const traceLatencyMs = trace?.latency_ms;
  const traceAi = trace?.ai;

  return (
    <div className="space-y-6">
      <div className="text-xl font-semibold">Observability</div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Card title="Total Requests">
          <div className="text-2xl font-semibold">
            {latest ? latest.totalRequests : "-"}
          </div>
          <div className="mt-1 text-xs text-gray-500">Cumulative counter</div>
        </Card>

        <Card title="Error Rate">
          <div className="text-2xl font-semibold">
            {latest ? `${latest.errorRatePct.toFixed(2)}%` : "-"}
          </div>
          <div className="mt-1 text-xs text-gray-500">4xx + 5xx / total</div>
        </Card>

        <Card title="5xx (Server Errors)">
          <div className="text-2xl font-semibold">{latest ? latest.err5xx : "-"}</div>
          <div className="mt-1 text-xs text-gray-500">
            {latest ? `${latest.serverErrorPct.toFixed(2)}% of total` : ""}
          </div>
        </Card>

        <Card title="Avg Latency">
          <div className="text-2xl font-semibold">
            {latest ? `${latest.avgLatencyMs.toFixed(1)} ms` : "-"}
          </div>
          <div className="mt-1 text-xs text-gray-500">From duration sum/count</div>
        </Card>

        <Card title="RPS (approx)">
          <div className="text-2xl font-semibold">{latest ? latest.rps.toFixed(2) : "-"}</div>
          <div className="mt-1 text-xs text-gray-500">Delta requests / time</div>
        </Card>
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          title="Latency (ms) over time"
          right={
            <button onClick={loadMetrics} className="rounded border px-3 py-1 text-xs">
              Refresh
            </button>
          }
        >
          {/* ✅ (3) Empty state */}
          {chartData.length === 0 ? (
            <div className="text-sm text-gray-500">Collecting metrics…</div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="latencyMs" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Error rate (%) over time">
          {chartData.length === 0 ? (
            <div className="text-sm text-gray-500">Collecting metrics…</div>
          ) : (
            <>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="errorPct" dot={false} strokeWidth={2} />
                    <Line
                      type="monotone"
                      dataKey="serverErrorPct"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <Badge tone="amber">errorPct</Badge>
                <span>= 4xx+5xx / total</span>
                <span className="mx-2">•</span>
                <Badge tone="red">serverErrorPct</Badge>
                <span>= 5xx / total</span>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* METRICS RAW */}
      <Card
        title="Metrics (Prometheus)"
        right={
          <div className="flex gap-2">
            <button onClick={loadMetrics} className="rounded border px-3 py-1 text-xs">
              Refresh
            </button>
            <button onClick={copyMetrics} className="rounded border px-3 py-1 text-xs">
              Copy
            </button>
          </div>
        }
      >
        <textarea
          className="h-56 w-full rounded-lg border bg-white p-3 font-mono text-xs"
          value={metricsText}
          readOnly
        />
      </Card>

      {/* AUDIT */}
      <Card
        title="Audit Log"
        right={
          <button onClick={loadAudit} className="rounded border px-3 py-1 text-xs">
            Refresh
          </button>
        }
      >
        {/* FILTERS */}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            placeholder="Status (2 / 4 / 5)"
            className="rounded border px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />

          <input
            placeholder="Path contains..."
            className="rounded border px-3 py-2 text-sm"
            value={pathFilter}
            onChange={(e) => setPathFilter(e.target.value)}
          />

          <input
            placeholder="Request-ID contains..."
            className="rounded border px-3 py-2 text-sm"
            value={requestIdFilter}
            onChange={(e) => setRequestIdFilter(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b">
              <tr>
                <th className="py-2">Time</th>
                <th>User</th>
                <th>Path</th>
                <th>Status</th>
                <th>Request-ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredAudit.map((item, i) => {
                const isSelected = selected?.request_id === item.request_id;
                return (
                  <tr
                    key={i}
                    className={`border-b ${
                      isSelected
                        ? "bg-black/[0.03]"
                        : item.status_code >= 500
                        ? "bg-red-50"
                        : item.status_code >= 400
                        ? "bg-amber-50"
                        : ""
                    }`}
                  >
                    <td className="py-2">{new Date(item.timestamp).toLocaleString()}</td>
                    <td>{item.user}</td>
                    <td className="font-mono text-xs">{item.path}</td>
                    <td>
                      <Badge tone={toneForStatus(item.status_code)}>{item.status_code}</Badge>
                    </td>
                    <td className="font-mono text-xs">
                      <button
                        className="rounded px-2 py-1 text-left hover:bg-black/5"
                        onClick={() => setSelected(item)}
                        title="Open trace details"
                      >
                        {item.request_id}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredAudit.length === 0 && (
            <div className="mt-4 text-sm text-gray-500">No audit entries found.</div>
          )}
        </div>
      </Card>

      {/* TRACE MODAL */}
      <Modal
        open={!!selected}
        title="Trace / Request Details"
        onClose={() => setSelected(null)}
        right={
          selected ? (
            <div className="flex gap-2">
              <button
                onClick={() => copyText(selected.request_id)}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Copy Request-ID
              </button>
              {selected.details && (
                <button
                  onClick={() => copyText(prettyDetails(selected.details))}
                  className="rounded-lg border px-3 py-1.5 text-sm"
                >
                  Copy Details
                </button>
              )}
            </div>
          ) : null
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-gray-500">Timestamp</div>
                <div className="mt-1 font-medium">
                  {new Date(selected.timestamp).toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500">User</div>
                <div className="mt-1 font-medium">{selected.user}</div>
              </div>

              <div className="md:col-span-2">
                <div className="text-xs text-gray-500">Path</div>
                <div className="mt-1 font-mono text-xs">{selected.path}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Status</div>
                <div className="mt-1">
                  <Badge tone={toneForStatus(selected.status_code)}>
                    {selected.status_code}
                  </Badge>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Request-ID</div>
                <div className="mt-1 font-mono text-xs">{selected.request_id}</div>
              </div>
            </div>

            {/* ✅ (4) Rich trace viewer (only if JSON details exist) */}
            {trace && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-500">Trace Latency</div>
                  <div className="mt-1">
                    <Badge
                      tone={
                        Number(traceLatencyMs) > 1500
                          ? "red"
                          : Number(traceLatencyMs) > 500
                          ? "amber"
                          : "green"
                      }
                    >
                      {fmtMs(traceLatencyMs)}
                    </Badge>
                  </div>

                  {trace?.downstream?.ai_call_ms !== undefined && (
                    <div className="mt-2 text-xs text-gray-600">
                      AI call: <span className="font-mono">{fmtMs(trace.downstream.ai_call_ms)}</span>
                    </div>
                  )}

                  {trace?.downstream?.legacy_call_ms !== undefined && (
                    <div className="mt-1 text-xs text-gray-600">
                      Legacy call:{" "}
                      <span className="font-mono">{fmtMs(trace.downstream.legacy_call_ms)}</span>
                    </div>
                  )}
                </div>

                {traceAi && (
                  <div className="rounded-xl border p-3">
                    <div className="text-sm font-semibold">AI Classification</div>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        Category:{" "}
                        <Badge tone="green">{traceAi.category ?? "-"}</Badge>
                      </div>
                      <div>
                        Priority:{" "}
                        <Badge tone="amber">{traceAi.priority ?? "-"}</Badge>
                      </div>

                      <div className="col-span-2 text-xs text-gray-600">
                        Model: <span className="font-mono">{traceAi.model ?? "-"}</span>{" "}
                        • Confidence:{" "}
                        <span className="font-mono">{pct(traceAi.confidence)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="text-xs text-gray-500">Details</div>
              <textarea
                className="mt-2 h-56 w-full rounded-lg border bg-white p-3 font-mono text-xs"
                readOnly
                value={prettyDetails(selected.details) || "No details."}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}