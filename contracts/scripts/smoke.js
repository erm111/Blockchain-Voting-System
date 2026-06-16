// End-to-end smoke test: official sets up an election on-chain, then a vote is
// cast THROUGH THE BACKEND (pooled relayer + batched castVotes). Verifies the
// optimized vote path works against the live deployment.
const hre = require("hardhat");

const API = process.env.API || "http://127.0.0.1:4000";
const MATRIC = "19/0001";

async function main() {
  const { ethers } = hre;
  const dep = require("../../shared/BVS.json");
  const [official] = await ethers.getSigners();
  const bvs = new ethers.Contract(dep.address, dep.abi, official);

  console.log("Setting up election as official:", official.address);
  await (await bvs.createElection("SMOKE TEST ELECTION")).wait();
  const id = Number(await bvs.electionCount());
  await (await bvs.addPosition(id, "President")).wait();
  await (await bvs.addPosition(id, "Vice President")).wait();
  await (await bvs.addCandidate(id, 1, "Ada")).wait();
  await (await bvs.addCandidate(id, 1, "Bola")).wait();
  await (await bvs.addCandidate(id, 2, "Chidi")).wait();
  await (await bvs.addCandidate(id, 2, "Dare")).wait();
  await (await bvs.startElection(id, 86400)).wait();

  // Student registers via backend (matric + department), then official approves.
  await fetch(`${API}/api/elections/${id}/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matric: MATRIC, department: "B.Sc Computer Science" }),
  });
  const hash = ethers.keccak256(ethers.toUtf8Bytes(MATRIC));
  await (await bvs.approveVoter(id, hash)).wait();
  console.log(`Election #${id} active; ${MATRIC} registered + approved.`);

  // Vote via the BACKEND (relayer pool + castVotes), not directly.
  const res = await fetch(`${API}/api/elections/${id}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      matric: MATRIC,
      votes: [
        { positionId: 1, candidateId: 1 }, // President -> Ada
        { positionId: 2, candidateId: 2 }, // VP -> Dare
      ],
    }),
  });
  const body = await res.json();
  console.log("Backend vote response:", JSON.stringify(body));

  const results = await bvs.getResults(id);
  for (const p of results) {
    console.log(`\n${p.name}:`);
    for (const c of p.candidates) console.log(`  ${c.name}: ${c.voteCount}`);
  }

  const status = await (await fetch(`${API}/api/elections/${id}/status/${encodeURIComponent(MATRIC)}`)).json();
  console.log("\nVoter status (votedChoice positionId->candidateId):", JSON.stringify(status.votedChoice));

  const voters = await (await fetch(`${API}/api/elections/${id}/voters`)).json();
  console.log("Voters summary:", JSON.stringify(voters.summary));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
