import { useEffect, useState } from "react";
import { readContract, loadAllElections } from "../chain";
import { fmtTime, STATUS_BADGE } from "../lib/format";
import ResultsChart from "../components/ResultsChart";

export default function Results() {
  const [elections, setElections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const c = await readContract();
      const list = await loadAllElections(c);
      setElections(list);
      setSelected((prev) => prev ?? list[list.length - 1]?.id ?? null);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000); // live refresh
    return () => clearInterval(t);
  }, []);

  if (loading) return <p className="text-slate-500">Loading results…</p>;
  if (error) return <ErrorBox msg={error} />;
  if (elections.length === 0) return <p className="text-slate-500">No elections created yet.</p>;

  const current = elections.find((e) => e.id === selected) || elections[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Results</h1>
        <select
          className="input max-w-xs"
          value={current.id}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {elections.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.statusLabel})
            </option>
          ))}
        </select>
        <span className={`badge ${STATUS_BADGE[current.statusLabel]}`}>{current.statusLabel}</span>
      </div>

      <p className="text-sm text-slate-500">
        {current.status === 1
          ? "Voting is open — tallies update live."
          : current.status === 2
          ? `Final results. Voting closed ${fmtTime(current.endTime)}.`
          : "This election has not started yet."}
      </p>

      {current.positions.length === 0 ? (
        <p className="text-slate-500">No positions configured.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {current.positions.map((p) => (
            <ResultsChart key={p.id} position={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorBox({ msg }) {
  return (
    <div className="card border-red-200 bg-red-50 text-red-700">
      <p className="font-semibold">Couldn't load results</p>
      <p className="text-sm">{msg}</p>
      <p className="mt-2 text-xs">
        Make sure Ganache is running, the contract is deployed, and the backend is up.
      </p>
    </div>
  );
}
