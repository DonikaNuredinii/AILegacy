import { useMemo, useState } from "react";
import { postWithMeta } from "../api/request";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";

type AnalyzeOut = {
  category: string;
  priority: string;
  recommendation: string;
  summary: string;
  model: string;
  confidence?: number;
};

type CompareOut = {
  lr: AnalyzeOut;
  nb: AnalyzeOut;
  winner: string;
};

type BaselineVsMlOut = {
  baseline: AnalyzeOut;
  ml: AnalyzeOut;
};

function confidenceBar(value?: number) {
  if (value === undefined) return null;
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="mt-2">
      <div className="h-2 w-full rounded bg-gray-200">
        <div className="h-2 rounded bg-black" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 text-xs text-gray-600">Confidence: {percent}%</div>
    </div>
  );
}

function diffLine(label: string, left: string, right: string) {
  const same = left === right;
  return (
    <div className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm">
      <div className="text-gray-700">{label}</div>
      <div className="flex items-center gap-2">
        <span className="rounded-md border bg-gray-50 px-2 py-0.5 font-mono text-xs">{left}</span>
        <span className="text-gray-400">→</span>
        <span className="rounded-md border bg-gray-50 px-2 py-0.5 font-mono text-xs">{right}</span>
        <Badge tone={same ? "green" : "amber"}>{same ? "same" : "diff"}</Badge>
      </div>
    </div>
  );
}

export default function AiPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [result, setResult] = useState<AnalyzeOut | null>(null);
  const [compareResult, setCompareResult] = useState<CompareOut | null>(null);

  const [bm, setBm] = useState<BaselineVsMlOut | null>(null);

  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<"analyze" | "compare" | "baseline_vs_ml">("analyze");

  const [analyzeMode, setAnalyzeMode] = useState<"baseline" | "ml">("ml");

  async function analyzeWithMode(m: "baseline" | "ml") {
    return await postWithMeta<AnalyzeOut>(`/api/v1/ai/analyze?mode=${m}`, {
      title,
      description,
      department: "general",
    });
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    setCompareResult(null);
    setBm(null);
    setResult(null);
    setRequestId(undefined);

    try {
      const res = await analyzeWithMode(analyzeMode);
      setResult(res.data);
      setRequestId(res.requestId);
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? e?.message ?? "Analyze failed";
      const reqId = e?.response?.headers?.["x-request-id"];
      setError(detail);
      setRequestId(reqId);
    } finally {
      setLoading(false);
    }
  }

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    setResult(null);
    setBm(null);
    setCompareResult(null);
    setRequestId(undefined);

    try {
      const res = await postWithMeta<CompareOut>("/api/v1/ai/compare", {
        title,
        description,
        department: "general",
      });
      setCompareResult(res.data);
      setRequestId(res.requestId);
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? e?.message ?? "Compare failed";
      const reqId = e?.response?.headers?.["x-request-id"];
      setError(detail);
      setRequestId(reqId);
    } finally {
      setLoading(false);
    }
  }

  async function handleBaselineVsMl(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    setResult(null);
    setCompareResult(null);
    setBm(null);
    setRequestId(undefined);

    try {
      const [b, m] = await Promise.all([analyzeWithMode("baseline"), analyzeWithMode("ml")]);
      setBm({ baseline: b.data, ml: m.data });
      setRequestId(m.requestId ?? b.requestId);
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? e?.message ?? "Baseline vs ML compare failed";
      const reqId = e?.response?.headers?.["x-request-id"];
      setError(detail);
      setRequestId(reqId);
    } finally {
      setLoading(false);
    }
  }

  const diffs = useMemo(() => {
    if (!bm) return null;
    return {
      category: bm.baseline.category,
      category2: bm.ml.category,
      priority: bm.baseline.priority,
      priority2: bm.ml.priority,
    };
  }, [bm]);

  return (
    <div className="space-y-6">
      <div className="text-xl font-semibold">AI Assistant</div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setMode("analyze")}
          className={`rounded-lg px-4 py-2 text-sm ${
            mode === "analyze" ? "bg-black text-white" : "border hover:bg-gray-50"
          }`}
        >
          Analyze
        </button>

        <button
          onClick={() => setMode("compare")}
          className={`rounded-lg px-4 py-2 text-sm ${
            mode === "compare" ? "bg-black text-white" : "border hover:bg-gray-50"
          }`}
        >
          Compare LR vs NB
        </button>

        <button
          onClick={() => setMode("baseline_vs_ml")}
          className={`rounded-lg px-4 py-2 text-sm ${
            mode === "baseline_vs_ml" ? "bg-black text-white" : "border hover:bg-gray-50"
          }`}
        >
          Compare Baseline vs ML
        </button>
      </div>

      <Card
        title={
          mode === "analyze"
            ? "Analyze Ticket with AI"
            : mode === "compare"
            ? "Compare Models (LR vs NB)"
            : "Compare Baseline vs ML"
        }
      >
        <form
          onSubmit={mode === "analyze" ? handleAnalyze : mode === "compare" ? handleCompare : handleBaselineVsMl}
          className="space-y-4"
        >
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

          {mode === "analyze" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-gray-50 p-3">
              <div className="text-sm font-medium">Mode</div>

              <button
                type="button"
                onClick={() => setAnalyzeMode("baseline")}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  analyzeMode === "baseline" ? "bg-black text-white" : "border bg-white hover:bg-gray-50"
                }`}
              >
                Baseline
              </button>

              <button
                type="button"
                onClick={() => setAnalyzeMode("ml")}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  analyzeMode === "ml" ? "bg-black text-white" : "border bg-white hover:bg-gray-50"
                }`}
              >
                ML (tfidf+logreg)
              </button>

              <div className="ml-auto text-xs text-gray-600">
                sends: <span className="font-mono">/api/v1/ai/analyze?mode={analyzeMode}</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
            >
              {loading ? "Processing..." : mode === "analyze" ? "Analyze" : mode === "compare" ? "Compare" : "Run Compare"}
            </button>

            {requestId && (
              <div className="text-xs text-gray-600">
                Request-Id: <span className="font-mono">{requestId}</span>
              </div>
            )}
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </Card>

      {result && (
        <Card title="AI Result" right={<Badge tone="green">OK</Badge>}>
          <div className="space-y-2 text-sm">
            <div>
              Category: <Badge tone="green">{result.category}</Badge>
            </div>
            <div>
              Priority: <Badge tone="amber">{result.priority}</Badge>
            </div>
            <div className="text-xs text-gray-600">
              Model: <span className="font-mono">{result.model}</span>
            </div>

            {confidenceBar(result.confidence)}

            <div className="pt-2">
              <div className="text-xs text-gray-500">Recommendation</div>
              <div className="mt-1 rounded-lg border bg-gray-50 p-3">{result.recommendation}</div>
            </div>

            <div className="pt-2">
              <div className="text-xs text-gray-500">Summary</div>
              <div className="mt-1 rounded-lg border bg-white p-3">{result.summary}</div>
            </div>
          </div>

          <pre className="mt-4 max-h-64 overflow-auto rounded-lg border bg-gray-50 p-3 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        </Card>
      )}

      {compareResult && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card
            title="Logistic Regression"
            right={compareResult.winner === "lr" ? <Badge tone="green">Winner</Badge> : null}
          >
            <div className="space-y-2 text-sm">
              <div>
                Category: <Badge tone="green">{compareResult.lr.category}</Badge>
              </div>
              <div>
                Priority: <Badge tone="amber">{compareResult.lr.priority}</Badge>
              </div>
              <div className="text-xs text-gray-600">
                Model: <span className="font-mono">{compareResult.lr.model}</span>
              </div>
              {confidenceBar(compareResult.lr.confidence)}
              <div className="pt-2">
                <div className="text-xs text-gray-500">Recommendation</div>
                <div className="mt-1 rounded-lg border bg-gray-50 p-3">{compareResult.lr.recommendation}</div>
              </div>
            </div>
          </Card>

          <Card
            title="Naive Bayes"
            right={compareResult.winner === "nb" ? <Badge tone="green">Winner</Badge> : null}
          >
            <div className="space-y-2 text-sm">
              <div>
                Category: <Badge tone="green">{compareResult.nb.category}</Badge>
              </div>
              <div>
                Priority: <Badge tone="amber">{compareResult.nb.priority}</Badge>
              </div>
              <div className="text-xs text-gray-600">
                Model: <span className="font-mono">{compareResult.nb.model}</span>
              </div>
              {confidenceBar(compareResult.nb.confidence)}
              <div className="pt-2">
                <div className="text-xs text-gray-500">Recommendation</div>
                <div className="mt-1 rounded-lg border bg-gray-50 p-3">{compareResult.nb.recommendation}</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {bm && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card title="Baseline (keyword)" right={<Badge tone="gray">{bm.baseline.model ?? "baseline"}</Badge>}>
              <div className="space-y-2 text-sm">
                <div>
                  Category: <Badge tone="green">{bm.baseline.category}</Badge>
                </div>
                <div>
                  Priority: <Badge tone="amber">{bm.baseline.priority}</Badge>
                </div>
                <div className="text-xs text-gray-600">
                  Model: <span className="font-mono">{bm.baseline.model}</span>
                </div>
                {confidenceBar(bm.baseline.confidence)}
                <div className="pt-2">
                  <div className="text-xs text-gray-500">Recommendation</div>
                  <div className="mt-1 rounded-lg border bg-gray-50 p-3">{bm.baseline.recommendation}</div>
                </div>
                <div className="pt-2">
                  <div className="text-xs text-gray-500">Summary</div>
                  <div className="mt-1 rounded-lg border bg-white p-3">{bm.baseline.summary}</div>
                </div>
              </div>
            </Card>

            <Card title="ML (tfidf+logreg)" right={<Badge tone="gray">{bm.ml.model}</Badge>}>
              <div className="space-y-2 text-sm">
                <div>
                  Category: <Badge tone="green">{bm.ml.category}</Badge>
                </div>
                <div>
                  Priority: <Badge tone="amber">{bm.ml.priority}</Badge>
                </div>
                <div className="text-xs text-gray-600">
                  Model: <span className="font-mono">{bm.ml.model}</span>
                </div>
                {confidenceBar(bm.ml.confidence)}
                <div className="pt-2">
                  <div className="text-xs text-gray-500">Recommendation</div>
                  <div className="mt-1 rounded-lg border bg-gray-50 p-3">{bm.ml.recommendation}</div>
                </div>
                <div className="pt-2">
                  <div className="text-xs text-gray-500">Summary</div>
                  <div className="mt-1 rounded-lg border bg-white p-3">{bm.ml.summary}</div>
                </div>
              </div>
            </Card>
          </div>

          {diffs && (
            <Card title="Differences (Baseline → ML)">
              <div className="space-y-2">
                {diffLine("Category", diffs.category, diffs.category2)}
                {diffLine("Priority", diffs.priority, diffs.priority2)}
              </div>

             
            </Card>
          )}
        </div>
      )}
    </div>
  );
}