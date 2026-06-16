import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useWallet } from "../lib/WalletContext";
import { readContract, loadAllElections } from "../chain";
import { apiListVoters } from "../api";

const STATUS_STYLES = {
  active: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  deactivated: "bg-red-100 text-red-700",
};

export default function Voters() {
  const { account, isOfficial, error, connect, tx } = useWallet();
  const [params, setParams] = useSearchParams();
  const [elections, setElections] = useState([]);
  const [electionId, setElectionId] = useState(Number(params.get("election")) || null);
  const [data, setData] = useState(null); // { voters, summary }
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  async function loadElections() {
    try {
      const c = await readContract();
      const list = await loadAllElections(c);
      setElections(list);
      setElectionId((prev) => prev ?? list[list.length - 1]?.id ?? null);
    } catch (e) {
      setLoadErr(e.message);
    }
  }

  async function loadVoters() {
    if (!electionId) return;
    try {
      setData(await apiListVoters(electionId));
      setLoadErr("");
    } catch (e) {
      setLoadErr(e.message);
    }
  }

  useEffect(() => {
    loadElections();
  }, []);
  useEffect(() => {
    if (electionId) setParams({ election: String(electionId) }, { replace: true });
    loadVoters();
    const t = setInterval(loadVoters, 8000);
    return () => clearInterval(t);
  }, [electionId]);

  async function setActive(matricHash, active) {
    setBusy(true);
    const ok = await tx((c) =>
      active ? c.approveVoter(electionId, matricHash) : c.revokeVoter(electionId, matricHash)
    );
    if (ok) await loadVoters();
    setBusy(false);
  }

  const departments = useMemo(
    () => (data ? Object.keys(data.summary.byDepartment).sort() : []),
    [data]
  );

  const shown = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.voters.filter(
      (v) =>
        (statusFilter === "all" || v.status === statusFilter) &&
        (deptFilter === "all" || v.department === deptFilter) &&
        (!q || v.matric.toLowerCase().includes(q) || v.department.toLowerCase().includes(q))
    );
  }, [data, statusFilter, deptFilter, search]);

  if (!account) {
    return (
      <div className="mx-auto max-w-md">
        <div className="card text-center">
          <h1 className="text-xl font-bold">Voter Management</h1>
          <p className="mt-2 text-sm text-slate-600">
            Connect the official's MetaMask wallet to verify and manage voters.
          </p>
          <button className="btn-primary mt-4 w-full" onClick={connect}>
            Connect MetaMask
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Voter Management</h1>
          <Link to="/admin" className="text-sm text-babcock hover:underline">
            ← Back to dashboard
          </Link>
        </div>
        <select
          className="input max-w-xs"
          value={electionId || ""}
          onChange={(e) => setElectionId(Number(e.target.value))}
        >
          {elections.length === 0 && <option>No elections</option>}
          {elections.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.statusLabel})
            </option>
          ))}
        </select>
      </div>

      {!isOfficial && (
        <div className="card border-amber-200 bg-amber-50 text-sm text-amber-800">
          This wallet isn't an official, so activate/deactivate will be rejected by the contract.
        </div>
      )}
      {(error || loadErr) && (
        <div className="card border-red-200 bg-red-50 text-sm text-red-700">{error || loadErr}</div>
      )}

      {/* Summary cards */}
      {s && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Registered" value={s.total} tone="bg-slate-100 text-slate-700" />
          <Stat label="Active" value={s.active} tone="bg-green-100 text-green-700" />
          <Stat label="Pending" value={s.pending} tone="bg-amber-100 text-amber-700" />
          <Stat label="Deactivated" value={s.deactivated} tone="bg-red-100 text-red-700" />
        </div>
      )}

      {/* Department breakdown */}
      {s && departments.length > 0 && (
        <div className="card">
          <h2 className="font-bold text-slate-800">Registrations by department</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2 text-right">Registered</th>
                  <th className="px-3 py-2 text-right">Active</th>
                  <th className="px-3 py-2 text-right">Pending</th>
                  <th className="px-3 py-2 text-right">Deactivated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departments.map((d) => {
                  const row = s.byDepartment[d];
                  return (
                    <tr key={d} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <button
                          className="text-left hover:text-babcock hover:underline"
                          onClick={() => setDeptFilter(d)}
                          title="Filter the list to this department"
                        >
                          {d}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{row.total}</td>
                      <td className="px-3 py-2 text-right text-green-700">{row.active}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{row.pending}</td>
                      <td className="px-3 py-2 text-right text-red-700">{row.deactivated}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Voter list with filters + actions */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-bold text-slate-800">
            Voters {data ? `(${shown.length} shown)` : ""}
          </h2>
          <select className="input max-w-[10rem]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <select className="input max-w-[14rem]" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <input
            className="input max-w-[12rem]"
            placeholder="Search matric…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-ghost text-sm" disabled={busy} onClick={loadVoters}>
            ↻ Refresh
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Matric No.</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    {data ? "No voters match these filters." : "Loading…"}
                  </td>
                </tr>
              ) : (
                shown.map((v) => (
                  <tr key={v.matric}>
                    <td className="px-3 py-2 font-mono">{v.matric}</td>
                    <td className="px-3 py-2 text-slate-600">{v.department}</td>
                    <td className="px-3 py-2">
                      <span className={`badge ${STATUS_STYLES[v.status]}`}>{v.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {v.status === "active" ? (
                        <button
                          className="btn px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                          disabled={busy}
                          onClick={() => setActive(v.matricHash, false)}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          className="btn-outline px-3 py-1 text-sm"
                          disabled={busy}
                          onClick={() => setActive(v.matricHash, true)}
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="card">
      <div className={`badge ${tone}`}>{label}</div>
      <div className="mt-2 text-3xl font-extrabold text-slate-800">{value ?? "—"}</div>
    </div>
  );
}
