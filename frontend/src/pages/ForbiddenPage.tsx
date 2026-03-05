import { Link } from "react-router-dom";

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-md rounded-xl border bg-white p-6 shadow-sm space-y-2">
        <div className="text-xl font-semibold">403 — Forbidden</div>
        <div className="text-sm text-gray-600">You don’t have access to this section.</div>
        <Link className="text-blue-600 underline" to="/">
          Go back
        </Link>
      </div>
    </div>
  );
}