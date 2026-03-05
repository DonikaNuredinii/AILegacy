import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { useAiHealth, useGatewayHealth, useLegacyHealth } from "../api/health";
import { fetchAudit, fetchSimState, setAiFail, setLegacyDelay } from "../api/admin";
import type { AuditRow, SimState } from "../api/admin";
import { ExperimentPanel } from "../components/ExperimentPanel";

function statusTone(ok: boolean | null) {
  if (ok === null) return "gray" as const;
  return ok ? ("green" as const) : ("red" as const);
}

function JsonBlock({ data }: { data: any }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg border bg-gray-50 p-3 text-xs text-gray-800">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function codeTone(status: number) {
  if (status >= 500) return "red" as const;
  if (status >= 400) return "amber" as const;
  return "green" as const;
}

export default function DashboardPage() {
  const { user, logout } = useAuth();

  const gw = useGatewayHealth();
  const legacy = useLegacyHealth();
  const ai = useAiHealth();

  const [showGw, setShowGw] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [showAi, setShowAi] = useState(false);

  const gwOk = gw.isSuccess ? gw.data.status === "ok" : gw.isError ? false : null;
  const legacyOk = legacy.isSuccess ? legacy.data.status === "ok" : legacy.isError ? false : null;
  const aiOk = ai.isSuccess ? ai.data.status === "ok" : ai.isError ? false : null;

  const isAdmin = user?.role === "admin";

  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditErr, setAuditErr] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  async function loadAudit() {
    if (!isAdmin) return;
    setAuditErr(null);
    setAuditLoading(true);
    try {
      const rows = await fetchAudit();
      setAudit(rows);
    } catch (e: any) {
      setAuditErr(e?.response?.data?.detail ?? e.message);
    } finally {
      setAuditLoading(false);
    }
  }

  const top5 = useMemo(() => (audit ? audit.slice(0, 5) : []), [audit]);

  useEffect(() => {
    loadAudit();
  }, [isAdmin]);


  const [sim, setSim] = useState<SimState | null>(null);
  const [simErr, setSimErr] = useState<string | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [delayDraft, setDelayDraft] = useState<number>(0);

  async function loadSim() {
    if (!isAdmin) return;
    setSimErr(null);
    setSimLoading(true);
    try {
      const s = await fetchSimState();
      setSim(s);
      setDelayDraft(s.legacy_delay_ms ?? 0);
    } catch (e: any) {
      setSimErr(e?.response?.data?.detail ?? e.message);
    } finally {
      setSimLoading(false);
    }
  }

  useEffect(() => {
    loadSim();
  }, [isAdmin]);

  async function toggleAiFail() {
    if (!isAdmin) return;
    setSimErr(null);
    try {
      const next = await setAiFail(!(sim?.ai_fail ?? false));
      setSim(next);
      loadAudit();
    } catch (e: any) {
      setSimErr(e?.response?.data?.detail ?? e.message);
    }
  }

  async function applyDelay() {
    if (!isAdmin) return;
    setSimErr(null);
    try {
      const next = await setLegacyDelay(delayDraft);
      setSim(next);
      loadAudit();
    } catch (e: any) {
      setSimErr(e?.response?.data?.detail ?? e.message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl p-6 space-y-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">AILEGACY Console</div>
            <div className="text-sm text-gray-600">
              Environment: <span className="font-mono">LOCAL</span> • Gateway:{" "}
              <span className="font-mono">http://localhost:8000</span> • Signed in as{" "}
              <span className="font-medium">{user?.username}</span> (
              <span className="font-mono">{user?.role}</span>)
            </div>
          </div>

          <button onClick={logout} className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">
            Logout
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card
            title="Gateway Health"
            right={<Badge tone={statusTone(gwOk)}>{gwOk === null ? "loading" : gwOk ? "ok" : "down"}</Badge>}
          >
            <div className="text-sm text-gray-600">
              Endpoint: <span className="font-mono">/health</span>
            </div>
            <button className="mt-3 text-sm text-blue-600 underline" onClick={() => setShowGw((v) => !v)}>
              {showGw ? "Hide details" : "Show details"}
            </button>
            {showGw && <div className="mt-3">{gw.isSuccess ? <JsonBlock data={gw.data} /> : <JsonBlock data={gw.error} />}</div>}
          </Card>

          <Card
            title="Legacy API Health"
            right={<Badge tone={statusTone(legacyOk)}>{legacyOk === null ? "loading" : legacyOk ? "ok" : "down"}</Badge>}
          >
            <div className="text-sm text-gray-600">
              Endpoint: <span className="font-mono">http://localhost:8001/health</span>
            </div>
            <button className="mt-3 text-sm text-blue-600 underline" onClick={() => setShowLegacy((v) => !v)}>
              {showLegacy ? "Hide details" : "Show details"}
            </button>
            {showLegacy && <div className="mt-3">{legacy.isSuccess ? <JsonBlock data={legacy.data} /> : <JsonBlock data={legacy.error} />}</div>}
          </Card>

          <Card
            title="AI Service Health"
            right={<Badge tone={statusTone(aiOk)}>{aiOk === null ? "loading" : aiOk ? "ok" : "down"}</Badge>}
          >
            <div className="text-sm text-gray-600">
              Endpoint: <span className="font-mono">http://localhost:8002/health</span>
            </div>

            {ai.isSuccess && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={ai.data.fail_mode ? "amber" : "green"}>fail_mode: {String(ai.data.fail_mode)}</Badge>
                <Badge tone="gray">mode: {ai.data.mode ?? "n/a"}</Badge>
                <Badge tone={ai.data.ml_ready ? "green" : "amber"}>ml_ready: {String(ai.data.ml_ready)}</Badge>
              </div>
            )}

            <button className="mt-3 text-sm text-blue-600 underline" onClick={() => setShowAi((v) => !v)}>
              {showAi ? "Hide details" : "Show details"}
            </button>

            {showAi && <div className="mt-3">{ai.isSuccess ? <JsonBlock data={ai.data} /> : <JsonBlock data={ai.error} />}</div>}
          </Card>
        </div>

        {isAdmin && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card
              title="Audit Preview (latest 5)"
              right={
                <div className="flex items-center gap-2">
                  {auditLoading ? <Badge tone="gray">loading</Badge> : <Badge tone="green">ready</Badge>}
                  <button onClick={loadAudit} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50">
                    Refresh
                  </button>
                </div>
              }
            >
              {auditErr && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {auditErr}
                </div>
              )}

              <div className="overflow-auto rounded-lg border bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr className="border-b">
                      <th className="p-2">time</th>
                      <th className="p-2">path</th>
                      <th className="p-2">status</th>
                      <th className="p-2">request_id</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top5.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-3 text-gray-600">
                          No audit logs yet.
                        </td>
                      </tr>
                    ) : (
                      top5.map((r) => (
                        <tr key={r.id} className="border-b last:border-b-0">
                          <td className="p-2 font-mono text-xs">{new Date(r.timestamp).toLocaleString()}</td>
                          <td className="p-2 font-mono text-xs">
                            {r.method} {r.path}
                          </td>
                          <td className="p-2">
                            <Badge tone={codeTone(r.status_code)}>{r.status_code}</Badge>
                          </td>
                          <td className="p-2 font-mono text-xs">{r.request_id}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Admin Simulation Panel" right={<Badge tone={simLoading ? "gray" : "green"}>{simLoading ? "loading" : "ready"}</Badge>}>
              {simErr && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {simErr}
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-3">
                  <div>
                    <div className="font-medium text-sm">AI_FAIL (simulate failure)</div>
                  </div>

                  <button
                    onClick={toggleAiFail}
                    className={`rounded-lg px-4 py-2 text-sm ${sim?.ai_fail ? "bg-red-600 text-white" : "border hover:bg-white"}`}
                  >
                    {sim?.ai_fail ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">Legacy Delay (ms)</div>
                    </div>

                    <Badge tone="gray">{delayDraft}ms</Badge>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={15000}
                    step={250}
                    value={delayDraft}
                    onChange={(e) => setDelayDraft(Number(e.target.value))}
                    className="w-full"
                  />

                  <div className="flex items-center gap-2">
                    <button onClick={applyDelay} className="rounded-lg bg-black px-4 py-2 text-sm text-white">
                      Apply
                    </button>
                    <button onClick={loadSim} className="rounded-lg border px-4 py-2 text-sm hover:bg-white">
                      Reset/Reload
                    </button>

                    <div className="ml-auto text-xs text-gray-600">
                      active: <span className="font-mono">{sim?.legacy_delay_ms ?? 0}ms</span>
                    </div>
                  </div>
                </div>

              </div>
            </Card>

           {isAdmin && ( 
               <div className="md:col-span-2">
              <ExperimentPanel />
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}