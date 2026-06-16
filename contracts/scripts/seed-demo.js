// Seeds a fresh ACTIVE election with an approved (not-yet-voted) voter, so the
// Playwright demo recorder can drive the student voting flow end-to-end.
const hre = require("hardhat");

const API = process.env.API || "http://127.0.0.1:4000";
const MATRIC = process.env.DEMO_MATRIC || "22/0001";
const DEPT = "B.Sc Computer Science";

async function main() {
  const { ethers } = hre;
  const dep = require("../../shared/BVS.json");
  const [official] = await ethers.getSigners();
  const bvs = new ethers.Contract(dep.address, dep.abi, official);

  await (await bvs.createElection("BVS Demo Election")).wait();
  const id = Number(await bvs.electionCount());
  await (await bvs.addPosition(id, "President")).wait();
  await (await bvs.addCandidate(id, 1, "Ada Obi")).wait();
  await (await bvs.addCandidate(id, 1, "Bola Eze")).wait();
  await (await bvs.addCandidate(id, 1, "Chidi Nwosu")).wait();
  await (await bvs.startElection(id, 86400)).wait();

  await fetch(`${API}/api/elections/${id}/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matric: MATRIC, department: DEPT }),
  });
  const hash = ethers.keccak256(ethers.toUtf8Bytes(MATRIC));
  await (await bvs.approveVoter(id, hash)).wait();

  console.log(`Seeded election #${id} "BVS Demo Election" (active); ${MATRIC} approved, not yet voted.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
