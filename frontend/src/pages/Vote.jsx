import { useEffect, useState } from "react";
import { readContract, loadElection, loadAllElections } from "../chain";
import { apiLogin, apiRequestParticipation, apiVoterStatus, apiVote } from "../api";
import { countdown, STATUS_BADGE } from "../lib/format";
import { DEPARTMENTS } from "../lib/departments";

export default function Vote() {
  const [matric, setMatric] = useState(localStorage.getItem("bvs_matric") || "");
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("bvs_matric"));
  const [error, setError] = useState("");

  async function login(e) {
    e.preventDefault();
    setError("");
    try {
      const { matric: m } = await apiLogin(matric);
      localStorage.setItem("bvs_matric", m);
      setMatric(m);
      setLoggedIn(true);
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    localStorage.removeItem("bvs_matric");
    setLoggedIn(false);
  }

  if (!loggedIn) {
    return (
      <div className="mx-auto max-w-md">
        <div className="card">
          <h1 className="text-xl font-bold">Student Log In</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your matric number in the format <span className="font-mono">00/0000</span>.
          </p>
          <form onSubmit={login} className="mt-4 space-y-3">
            <div>
              <label className="label">Matric Number</label>
              <input
                className="input font-mono"
                placeholder="19/0001"
                value={matric}
                onChange={(e) => setMatric(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full">Continue</button>
          </form>
        </div>
      </div>
    );
  }

  return <VotingArea matric={matric} onLogout={logout} />;
}

function VotingArea({ matric, onLogout }) {
  const [elections, setElections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [election, setElection] = useState(null);
  const [status, setStatus] = useState(null); // { approved, voted: {pid:bool} }
  const [choices, setChoices] = useState({}); // pid -> cid
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function loadList() {
    try {
      const c = await readContract();
      const list = await loadAllElections(c);
      setElections(list);
      const active = list.filter((e) => e.status === 1);
      setSelected((prev) => prev ?? active[0]?.id ?? list[list.length - 1]?.id ?? null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadSelected() {
    if (!selected) return;
    try {
      const c = await readContract();
      const e = await loadElection(c, selected);
      setElection(e);
      const st = await apiVoterStatus(selected, matric);
      setStatus(st);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadList();
  }, []);
  useEffect(() => {
    loadSelected();
  }, [selected]);

  async function requestParticipation() {
    if (!department) {
      setError("Please select your programme/department first.");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await apiRequestParticipation(selected, matric, department);
      setMsg("Request sent. An election official will verify and approve you shortly.");
      await loadSelected();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitVotes() {
    const votes = Object.entries(choices)
      .filter(([pid]) => !status.voted[pid])
      .map(([positionId, candidateId]) => ({ positionId: Number(positionId), candidateId }));
    if (votes.length === 0) {
      setError("Select at least one candidate for a position you haven't voted yet.");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const { results } = await apiVote(selected, matric, votes);
      const ok = results.filter((r) => r.status === "ok");
      const failed = results.filter((r) => r.status === "error");
      if (ok.length) setMsg(`✅ ${ok.length} vote(s) recorded on-chain. Tx: ${ok[0].txHash.slice(0, 12)}…`);
      if (failed.length) setError(failed.map((f) => `Position ${f.positionId}: ${f.reason}`).join(" | "));
      setChoices({});
      await loadSelected();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cast Your Vote</h1>
          <p className="text-sm text-slate-500">
            Logged in as <span className="font-mono font-semibold">{matric}</span>
          </p>
        </div>
        <button className="btn-ghost" onClick={onLogout}>
          Log out
        </button>
      </div>

      {elections.length === 0 ? (
        <p className="text-slate-500">No elections available yet.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="input max-w-xs"
            value={selected || ""}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {elections.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.statusLabel})
              </option>
            ))}
          </select>
          {election && (
            <span className={`badge ${STATUS_BADGE[election.statusLabel]}`}>
              {election.statusLabel}
              {election.status === 1 ? ` · ${countdown(election.endTime)}` : ""}
            </span>
          )}
        </div>
      )}

      {error && <div className="card border-red-200 bg-red-50 text-sm text-red-700">{error}</div>}
      {msg && <div className="card border-green-200 bg-green-50 text-sm text-green-700">{msg}</div>}

      {election && status && (
        <VoteBody
          {...{ election, status, choices, setChoices, department, setDepartment, requestParticipation, submitVotes, busy }}
        />
      )}
    </div>
  );
}

function VoteBody({ election, status, choices, setChoices, department, setDepartment, requestParticipation, submitVotes, busy }) {
  if (election.status === 2) {
    return (
      <div className="card text-slate-600">
        Voting has ended for this election. See the{" "}
        <a className="font-semibold text-babcock underline" href="/results">
          Results
        </a>{" "}
        page.
      </div>
    );
  }

  // Not approved yet -> show the verification request form (works before voting opens too).
  if (!status.approved) {
    return (
      <div className="card">
        <h3 className="font-bold text-slate-800">Get verified to vote</h3>
        <p className="mt-1 text-sm text-slate-600">
          Confirm your programme and request approval. An election official will verify your matric
          number and activate you. This keeps non-students and ex-students out.
        </p>
        <div className="mt-4 max-w-md">
          <label className="label">Programme / Department</label>
          <select className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Select your programme…</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary mt-4" disabled={busy || !department} onClick={requestParticipation}>
          Request to participate
        </button>
      </div>
    );
  }

  // Approved but voting hasn't opened yet.
  if (election.status === 0) {
    return (
      <div className="card border-green-200 bg-green-50 text-sm text-green-700">
        ✓ You're approved for this election. Voting hasn't opened yet — check back once an official
        starts it.
      </div>
    );
  }

  const allVoted = election.positions.every((p) => status.voted[p.id]);

  return (
    <div className="space-y-4">
      {election.positions.map((p) => {
        const voted = status.voted[p.id];
        const chosenId = status.votedChoice?.[p.id];
        const chosen = p.candidates.find((c) => c.id === chosenId);
        return (
          <div key={p.id} className="card">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{p.name}</h3>
              {voted && <span className="badge bg-green-100 text-green-700">✓ voted</span>}
            </div>

            {voted ? (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-green-600 text-white">
                  ✓
                </span>
                <div>
                  <p className="text-xs uppercase tracking-wide text-green-700">You voted for</p>
                  <p className="font-semibold text-slate-800">{chosen ? chosen.name : "—"}</p>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {p.candidates.map((c) => {
                  const isSel = choices[p.id] === c.id;
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                        isSel
                          ? "border-babcock bg-babcock/5"
                          : "border-slate-200 hover:border-babcock/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`pos-${p.id}`}
                        checked={isSel}
                        onChange={() => setChoices((c2) => ({ ...c2, [p.id]: c.id }))}
                      />
                      <span className="font-medium">{c.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {allVoted ? (
        <div className="card border-green-200 bg-green-50 text-sm text-green-700">
          You've voted in every position. Thank you! Your votes are on the blockchain.
        </div>
      ) : (
        <button className="btn-primary" disabled={busy} onClick={submitVotes}>
          {busy ? "Submitting…" : "Submit my vote(s)"}
        </button>
      )}
    </div>
  );
}
