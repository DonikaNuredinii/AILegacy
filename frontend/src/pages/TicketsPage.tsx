import { useState } from "react";
import { postWithMeta } from "../api/request";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";

type TicketOut = {
  id: number;
  title: string;
  description: string;
  department: string;
  status: string;
};

const DEPT_MAP: Record<string, string> = {
  GEN: "general",
  IT: "it",
  HR: "hr",
  FIN: "finance",
};

export default function TicketsPage() {
  const [mode, setMode] = useState<"normal" | "legacy">("normal");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("general");

  const [legacyTitle, setLegacyTitle] = useState("");
  const [legacyDesc, setLegacyDesc] = useState("");
  const [deptCode, setDeptCode] = useState("GEN");

  const [result, setResult] = useState<TicketOut | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleNormalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await postWithMeta<TicketOut>("/api/v1/tickets", {
        title,
        description,
        department,
      });
      setResult(res.data);
      setRequestId(res.requestId);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLegacySubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await postWithMeta<TicketOut>("/api/v1/tickets/legacy", {
        ticket_title: legacyTitle,
        ticket_desc: legacyDesc,
        dept_code: deptCode,
      });
      setResult(res.data);
      setRequestId(res.requestId);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-xl font-semibold">Ticket Management</div>

      <div className="flex gap-4">
        <button
          onClick={() => setMode("normal")}
          className={`rounded-lg px-4 py-2 text-sm ${
            mode === "normal" ? "bg-black text-white" : "border"
          }`}
        >
          Normal Ticket
        </button>

        <button
          onClick={() => setMode("legacy")}
          className={`rounded-lg px-4 py-2 text-sm ${
            mode === "legacy" ? "bg-black text-white" : "border"
          }`}
        >
          Legacy V1 Ticket
        </button>
      </div>

      <Card title={mode === "normal" ? "Create Ticket" : "Create Legacy Ticket"}>
        {mode === "normal" ? (
          <form onSubmit={handleNormalSubmit} className="space-y-4">
            <input
              placeholder="Title"
              className="w-full rounded-lg border px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              placeholder="Description"
              className="w-full rounded-lg border px-3 py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="general">general</option>
              <option value="it">it</option>
              <option value="hr">hr</option>
              <option value="finance">finance</option>
            </select>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-black px-4 py-2 text-white"
            >
              {loading ? "Sending..." : "Create via Gateway"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLegacySubmit} className="space-y-4">
            <input
              placeholder="ticket_title"
              className="w-full rounded-lg border px-3 py-2"
              value={legacyTitle}
              onChange={(e) => setLegacyTitle(e.target.value)}
            />
            <textarea
              placeholder="ticket_desc"
              className="w-full rounded-lg border px-3 py-2"
              value={legacyDesc}
              onChange={(e) => setLegacyDesc(e.target.value)}
            />

            {/* 🔹 Select first */}
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={deptCode}
              onChange={(e) => setDeptCode(e.target.value)}
            >
              <option value="GEN">GEN</option>
              <option value="IT">IT</option>
              <option value="HR">HR</option>
              <option value="FIN">FIN</option>
            </select>

            {/* 🔹 Enhanced Mapping Preview */}
            <div className="rounded-lg border bg-gray-50 p-4 text-sm space-y-3">
              <div className="font-semibold">Mapping Preview (Anti-Corruption Layer)</div>

              <div>
                <span className="font-medium">Legacy input:</span>{" "}
                <span className="font-mono">
                  {`{ ticket_title, ticket_desc, dept_code: "${deptCode}" }`}
                </span>
              </div>

              <div className="text-gray-500">↓ transformed by Gateway</div>

              <div>
                <span className="font-medium">Normalized payload:</span>{" "}
                <span className="font-mono">
                  {`{ title, description, department: "${DEPT_MAP[deptCode]}" }`}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-black px-4 py-2 text-white"
            >
              {loading ? "Sending..." : "Send Legacy → Gateway"}
            </button>
          </form>
        )}
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <Card title="Result" right={<Badge tone="green">HTTP 200</Badge>}>
          <div className="space-y-2 text-sm">
            <div>
              Ticket ID: <span className="font-mono">{result.id}</span>
            </div>
            <div>
              Status: <Badge tone="green">{result.status}</Badge>
            </div>
            <div>
              Department: <span className="font-mono">{result.department}</span>
            </div>
            {requestId && (
              <div>
                Request-Id: <span className="font-mono">{requestId}</span>
              </div>
            )}
          </div>

          <pre className="mt-4 overflow-auto rounded-lg border bg-gray-50 p-3 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}