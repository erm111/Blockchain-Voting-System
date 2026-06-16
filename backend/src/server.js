require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { chain, loadDeployment } = require("./chain");
const store = require("./store");
const { normalizeMatric, isValidMatric, matricHash } = require("./matric");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

function asyncRoute(fn) {
  return (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: err.shortMessage || err.message || "server error" });
  });
}

// --- Public config: frontend pulls address + ABI from here ----------------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get(
  "/api/contract",
  asyncRoute(async (_req, res) => {
    const { address, abi, network } = loadDeployment();
    res.json({ address, abi, network });
  })
);

// --- Voter login: matric format check only (campus identity) --------------
app.post(
  "/api/login",
  asyncRoute(async (req, res) => {
    const matric = normalizeMatric(req.body.matric);
    if (!isValidMatric(matric)) {
      return res.status(400).json({ error: "Matric number must look like 00/0000" });
    }
    res.json({ matric, matricHash: matricHash(matric) });
  })
);

// --- Voter requests to participate in an election -------------------------
app.post(
  "/api/elections/:id/request",
  asyncRoute(async (req, res) => {
    const electionId = Number(req.params.id);
    const matric = normalizeMatric(req.body.matric);
    const department = String(req.body.department || "").trim();
    if (!isValidMatric(matric)) {
      return res.status(400).json({ error: "Matric number must look like 00/0000" });
    }
    if (!department) {
      return res.status(400).json({ error: "Please select your programme/department" });
    }
    const { contract } = chain();
    const hash = matricHash(matric);
    const approved = await contract.isApproved(electionId, hash);
    store.addRequest(electionId, matric, department);
    res.json({ matric, matricHash: hash, department, approved });
  })
);

// --- Officials: list participation requests with live on-chain status -----
app.get(
  "/api/elections/:id/requests",
  asyncRoute(async (req, res) => {
    const electionId = Number(req.params.id);
    const { contract } = chain();
    const requests = store.listRequests(electionId);
    const enriched = await Promise.all(
      requests.map(async (r) => {
        const hash = matricHash(r.matric);
        const approved = await contract.isApproved(electionId, hash);
        return { ...r, matricHash: hash, approved };
      })
    );
    res.json({ requests: enriched });
  })
);

// --- Officials: full voter roster with status categories + department breakdown
// Status is derived from on-chain approval/revoke EVENTS (2 queries total, no
// per-voter RPC) so it scales to thousands of registrants:
//   active      = last event was Approved
//   deactivated = was approved at some point, last event was Revoked
//   pending     = registered but never approved
app.get(
  "/api/elections/:id/voters",
  asyncRoute(async (req, res) => {
    const electionId = Number(req.params.id);
    const { contract } = chain();
    const requests = store.listRequests(electionId);

    const [approvedLogs, revokedLogs] = await Promise.all([
      contract.queryFilter(contract.filters.VoterApproved(electionId)),
      contract.queryFilter(contract.filters.VoterRevoked(electionId)),
    ]);
    const events = [
      ...approvedLogs.map((l) => ({ t: "a", h: l.args.matricHash, b: l.blockNumber, i: l.index })),
      ...revokedLogs.map((l) => ({ t: "r", h: l.args.matricHash, b: l.blockNumber, i: l.index })),
    ].sort((x, y) => x.b - y.b || x.i - y.i);

    const everApproved = new Set();
    const finalState = new Map(); // matricHash -> "active" | "deactivated"
    for (const e of events) {
      const h = e.h.toLowerCase();
      if (e.t === "a") {
        everApproved.add(h);
        finalState.set(h, "active");
      } else if (everApproved.has(h)) {
        finalState.set(h, "deactivated");
      }
    }

    const summary = { total: 0, active: 0, pending: 0, deactivated: 0, byDepartment: {} };
    const voters = requests.map((r) => {
      const hash = matricHash(r.matric);
      const status = finalState.get(hash.toLowerCase()) || "pending";
      const department = r.department || "Unspecified";

      summary.total += 1;
      summary[status] += 1;
      if (!summary.byDepartment[department]) {
        summary.byDepartment[department] = { total: 0, active: 0, pending: 0, deactivated: 0 };
      }
      summary.byDepartment[department].total += 1;
      summary.byDepartment[department][status] += 1;

      return { matric: r.matric, department, matricHash: hash, status, requestedAt: r.requestedAt };
    });

    res.json({ voters, summary });
  })
);

// --- Voter status for a specific election (approved? voted which positions?)
app.get(
  "/api/elections/:id/status/:matric",
  asyncRoute(async (req, res) => {
    const electionId = Number(req.params.id);
    const matric = normalizeMatric(req.params.matric);
    if (!isValidMatric(matric)) {
      return res.status(400).json({ error: "Matric number must look like 00/0000" });
    }
    const { contract } = chain();
    const hash = matricHash(matric);
    const approved = await contract.isApproved(electionId, hash);

    const election = await contract.getElection(electionId);
    const positionCount = Number(election.positionCount);
    const voted = {};
    const votedChoice = {}; // positionId -> candidateId the voter picked
    for (let pid = 1; pid <= positionCount; pid++) {
      voted[pid] = await contract.hasVoted(electionId, pid, hash);
      if (voted[pid]) {
        votedChoice[pid] = Number(await contract.votedCandidate(electionId, pid, hash));
      }
    }
    res.json({ matric, matricHash: hash, approved, voted, votedChoice });
  })
);

// --- Voter casts votes; relayer submits on-chain --------------------------
// Body: { matric, votes: [{ positionId, candidateId }, ...] }
app.post(
  "/api/elections/:id/vote",
  asyncRoute(async (req, res) => {
    const electionId = Number(req.params.id);
    const matric = normalizeMatric(req.body.matric);
    const votes = Array.isArray(req.body.votes) ? req.body.votes : [];

    if (!isValidMatric(matric)) {
      return res.status(400).json({ error: "Matric number must look like 00/0000" });
    }
    if (votes.length === 0) {
      return res.status(400).json({ error: "No votes provided" });
    }

    const { contract, nextVote } = chain();
    const hash = matricHash(matric);

    const approved = await contract.isApproved(electionId, hash);
    if (!approved) {
      return res.status(403).json({ error: "You are not approved to vote in this election yet." });
    }

    // Whole ballot in ONE transaction via a pooled relayer. The contract skips
    // any position already voted, so duplicates can't fail the batch.
    const positionIds = votes.map((v) => Number(v.positionId));
    const candidateIds = votes.map((v) => Number(v.candidateId));
    try {
      const voteContract = nextVote();
      const tx = await voteContract.castVotes(electionId, positionIds, candidateIds, hash);
      const receipt = await tx.wait();
      res.json({ results: [{ status: "ok", txHash: receipt.hash, positions: positionIds }] });
    } catch (err) {
      res.json({
        results: [{ status: "error", reason: err.shortMessage || err.reason || err.message }],
      });
    }
  })
);

app.listen(PORT, () => {
  console.log(`BVS backend listening on http://127.0.0.1:${PORT}`);
});
