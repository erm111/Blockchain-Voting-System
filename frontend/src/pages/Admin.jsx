import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../lib/WalletContext";
import { readContract, loadAllElections } from "../chain";
import { DURATIONS, fmtTime, countdown, STATUS_BADGE } from "../lib/format";
import ResultsChart from "../components/ResultsChart";

export default function Admin() {
  const { account, isOfficial, error, connect: walletConnect, tx: walletTx } = useWallet();
  const [elections, setElections] = useState([]);
  const [loadErr, setLoadErr] = useState("");

  async function refresh() {
    try {
      const c = await readContract();
      setElections(await loadAllElections(c));
      setLoadErr("");
    } catch (e) {
      setLoadErr(e.message);
    }
  }

  // Wrap a write: run via wallet, then refresh the election list on success.
  async function tx(fn) {
    const ok = await walletTx(fn);
    if (ok) await refresh();
    return ok;
  }

  async function connect() {
    const ok = await walletConnect();
    if (ok) await refresh();
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!account) {
    return (
      <div className="mx-auto max-w-md">
        <div className="card text-center">
          <h1 className="text-xl font-bold">Election Officials</h1>
          <p className="mt-2 text-sm text-slate-600">
            Connect the MetaMask wallet that has the official role (on your Ganache network) to
            manage elections.
          </p>
          <button className="btn-primary mt-4 w-full" onClick={connect}>
            Connect MetaMask
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Officials Dashboard</h1>
        <div className="flex items-center gap-3">
          <Link to="/admin/voters" className="btn-outline text-sm">
            Voter management →
          </Link>
          <div className="text-right text-sm">
            <div className="font-mono text-slate-600">
              {account.slice(0, 8)}…{account.slice(-6)}
            </div>
            {isOfficial ? (
              <span className="badge bg-green-100 text-green-700">official ✓</span>
            ) : (
              <span className="badge bg-red-100 text-red-700">not an official</span>
            )}
          </div>
        </div>
      </div>

      {!isOfficial && (
        <div className="card border-amber-200 bg-amber-50 text-sm text-amber-800">
          This wallet does not have the official role, so writes will be rejected by the contract.
          Connect the deployer account, or have the owner grant this address via{" "}
          <span className="font-mono">addOfficial</span>.
        </div>
      )}
      {(error || loadErr) && (
        <div className="card border-red-200 bg-red-50 text-sm text-red-700">{error || loadErr}</div>
      )}

      <CreateElection tx={tx} />

      {elections.length === 0 ? (
        <p className="text-slate-500">No elections yet. Create one above.</p>
      ) : (
        <div className="space-y-5">
          {elections
            .slice()
            .reverse()
            .map((e) => (
              <ElectionCard key={e.id} election={e} tx={tx} />
            ))}
        </div>
      )}
    </div>
  );
}

function CreateElection({ tx }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="card">
      <h2 className="font-bold text-slate-800">Create a new election</h2>
      <div className="mt-3 flex gap-2">
        <input
          className="input"
          placeholder="e.g. SUG General Election 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="btn-primary whitespace-nowrap"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            const ok = await tx((c) => c.createElection(name.trim()));
            if (ok) setName("");
            setBusy(false);
          }}
        >
          Create
        </button>
      </div>
    </div>
  );
}

function ElectionCard({ election: e, tx }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">{e.name}</h3>
          <p className="text-xs text-slate-500">
            Election #{e.id} · {e.positions.length} position(s)
            {e.status === 1 && ` · ${countdown(e.endTime)}`}
            {e.status >= 1 && ` · ends ${fmtTime(e.endTime)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {e.status !== 2 && (
            <Link to={`/admin/voters?election=${e.id}`} className="btn-ghost text-sm">
              Manage voters
            </Link>
          )}
          {e.status === 1 && (
            <button
              className="btn-primary text-sm"
              disabled={busy}
              onClick={async () => {
                if (!confirm(`Stop "${e.name}" now and publish final results?`)) return;
                setBusy(true);
                await tx((c) => c.stopElection(e.id));
                setBusy(false);
              }}
            >
              ⏹ Stop & publish
            </button>
          )}
          <span className={`badge ${STATUS_BADGE[e.statusLabel]}`}>{e.statusLabel}</span>
        </div>
      </div>

      {e.status === 0 && <ConfigureElection election={e} tx={tx} />}

      {e.positions.length > 0 && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {e.positions.map((p) => (
            <ResultsChart key={p.id} position={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigureElection({ election: e, tx }) {
  const [posName, setPosName] = useState("");
  const [candName, setCandName] = useState("");
  const [candPos, setCandPos] = useState(e.positions[0]?.id || "");
  const [duration, setDuration] = useState(DURATIONS[2].seconds); // default 1 day
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Add a position</label>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="President"
              value={posName}
              onChange={(ev) => setPosName(ev.target.value)}
            />
            <button
              className="btn-outline whitespace-nowrap"
              disabled={busy || !posName.trim()}
              onClick={async () => {
                setBusy(true);
                const ok = await tx((c) => c.addPosition(e.id, posName.trim()));
                if (ok) setPosName("");
                setBusy(false);
              }}
            >
              Add
            </button>
          </div>
        </div>

        <div>
          <label className="label">Add a candidate</label>
          <div className="flex gap-2">
            <select
              className="input max-w-[40%]"
              value={candPos}
              onChange={(ev) => setCandPos(Number(ev.target.value))}
            >
              <option value="">Position…</option>
              {e.positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Candidate name"
              value={candName}
              onChange={(ev) => setCandName(ev.target.value)}
            />
            <button
              className="btn-outline whitespace-nowrap"
              disabled={busy || !candName.trim() || !candPos}
              onClick={async () => {
                setBusy(true);
                const ok = await tx((c) => c.addCandidate(e.id, candPos, candName.trim()));
                if (ok) setCandName("");
                setBusy(false);
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-4">
        <div>
          <label className="label">Voting duration</label>
          <select
            className="input"
            value={duration}
            onChange={(ev) => setDuration(Number(ev.target.value))}
          >
            {DURATIONS.map((d) => (
              <option key={d.seconds} value={d.seconds}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn-primary"
          disabled={busy || e.positions.length === 0}
          onClick={async () => {
            setBusy(true);
            await tx((c) => c.startElection(e.id, duration));
            setBusy(false);
          }}
          title={e.positions.length === 0 ? "Add at least one position first" : ""}
        >
          ▶ Start election
        </button>
        <p className="text-xs text-slate-500">
          Add positions & candidates first. Once started, configuration locks. Approve voters under{" "}
          <span className="font-medium">Manage voters</span>.
        </p>
      </div>
    </div>
  );
}
