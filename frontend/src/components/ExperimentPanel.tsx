// src/components/ExperimentPanel.tsx
import { useEffect, useMemo, useState } from "react";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { postWithMeta } from "../api/request";
import { fetchSimState, setAiFail } from "../api/admin";

type LogEntry = {
  ts: string;
  action: "AI_FAIL_ON" | "ANALYZE" | "AI_FAIL_OFF" | "SYNC_STATE";
  status?: number;
  requestId?: string;
  note?: string;
  data?: any;
};

const demoPayload = {
  title: "Payment issue",
  description: "Customer cannot complete checkout. Error 502 appears sometimes.",
  department: "finance",
};

function statusTone(status?: number) {
  if (typeof status !== "number") return "gray" as const;
  if (status >= 500) return "red" as const;
  if (status >= 400) return "amber" as const;
  return "green" as const;
}

export function ExperimentPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<null | "sync" | "on" | "analyze" | "off">(null);
  const [error, setError] = useState<string | null>(null);

  // ✅ REAL state for AI_FAIL (so UI “active” is correct)
  const [aiFail, setAiFailState] = useState<boolean>(false);

  function push(entry: Omit<LogEntry, "ts">) {
    setLogs((prev) => [{ ts: new Date().toISOString(), ...entry }, ...prev].slice(0, 30));
  }

  async function syncState() {
    setError(null);
    setLoading("sync");
    try {
      const st = await fetchSimState();
      setAiFailState(Boolean(st.ai_fail));
      push({
        action: "SYNC_STATE",
        status: 200,
        note: `synced ai_fail=${st.ai_fail}`,
        data: st,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? e?.message ?? "Failed to sync state";
      setError(msg);
      push({ action: "SYNC_STATE", status: 500, note: msg });
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    // auto-sync once on mount
    syncState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doFail(on: boolean) {
    setError(null);
    setLoading(on ? "on" : "off");
    try {
      const st = await setAiFail(on);
      setAiFailState(Boolean(st.ai_fail)); // ✅ update real state
      push({
        action: on ? "AI_FAIL_ON" : "AI_FAIL_OFF",
        status: 200,
        note: `ai_fail=${st.ai_fail}`,
        data: st,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? e?.message ?? "Failed";
      setError(msg);
      push({
        action: on ? "AI_FAIL_ON" : "AI_FAIL_OFF",
        status: e?.response?.status ?? 500,
        note: msg,
        data: e?.response?.data,
      });
    } finally {
      setLoading(null);
    }
  }

  async function runAnalyze() {
    setError(null);
    setLoading("analyze");
    try {
      const res = await postWithMeta<any>("/api/v1/ai/analyze", demoPayload);
      push({
        action: "ANALYZE",
        status: res.status,
        requestId: res.requestId,
        data: res.data,
      });
    } catch (e: any) {
      const status = e?.response?.status ?? 500;
      const reqId = e?.response?.headers?.["x-request-id"];
      const detail = e?.response?.data?.detail ?? e?.message ?? "Analyze failed";

      setError(detail);
      push({
        action: "ANALYZE",
        status,
        requestId: reqId,
        note: detail,
        data: e?.response?.data,
      });
    } finally {
      setLoading(null);
    }
  }

  const lastAnalyze = useMemo(() => logs.find((l) => l.action === "ANALYZE"), [logs]);
  const lastStatus = lastAnalyze?.status;

  return (
    <Card
      title="Experiment Log "
      right={
        <div className="flex items-center gap-2">
          <Badge tone={aiFail ? "red" : "green"}>AI_FAIL: {aiFail ? "ON" : "OFF"}</Badge>
          <Badge tone={statusTone(lastStatus)}>{lastStatus ?? "idle"}</Badge>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-lg px-3 py-2 text-sm ${
            aiFail ? "bg-red-600 text-white" : "border hover:bg-gray-50"
          }`}
          disabled={loading !== null}
          onClick={() => doFail(true)}
        >
          {loading === "on" ? "Enabling..." : aiFail ? "AI_FAIL ON (active)" : "AI_FAIL ON"}
        </button>

        <button
          className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
          disabled={loading !== null}
          onClick={runAnalyze}
        >
          {loading === "analyze" ? "Running..." : "Run Analyze"}
        </button>

        <button
          className={`rounded-lg px-3 py-2 text-sm ${
            !aiFail ? "bg-green-600 text-white" : "border hover:bg-gray-50"
          }`}
          disabled={loading !== null}
          onClick={() => doFail(false)}
        >
          {loading === "off" ? "Disabling..." : !aiFail ? "AI_FAIL OFF (active)" : "AI_FAIL OFF"}
        </button>

        <button
          className="ml-auto rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
          disabled={loading !== null}
          onClick={syncState}
        >
          {loading === "sync" ? "Syncing..." : "Sync state"}
        </button>

        <button
          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => setLogs([])}
        >
          Clear
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">time</th>
              <th className="p-2">action</th>
              <th className="p-2">status</th>
              <th className="p-2">request_id</th>
              <th className="p-2">note</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td className="p-3 text-gray-600" colSpan={5}>
                  No logs yet. Try: AI_FAIL ON → Run Analyze → AI_FAIL OFF → Run Analyze.
                </td>
              </tr>
            ) : (
              logs.map((l, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2 font-mono text-xs">{new Date(l.ts).toLocaleString()}</td>
                  <td className="p-2">
                    <Badge tone="gray">{l.action}</Badge>
                  </td>
                  <td className="p-2">
                    <Badge tone={statusTone(l.status)}>{l.status ?? "n/a"}</Badge>
                  </td>
                  <td className="p-2 font-mono text-xs">{l.requestId ?? "-"}</td>
                  <td className="p-2 text-gray-700">{l.note ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {lastAnalyze?.data && (
        <pre className="mt-4 max-h-64 overflow-auto rounded-lg border bg-gray-50 p-3 text-xs">
          {JSON.stringify(lastAnalyze.data, null, 2)}
        </pre>
      )}
    </Card>
  );
}