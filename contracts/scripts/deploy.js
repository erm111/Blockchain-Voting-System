const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying BVS with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const BVS = await hre.ethers.getContractFactory("BVS");
  const bvs = await BVS.deploy();
  await bvs.waitForDeployment();
  const address = await bvs.getAddress();
  const deployBlock = (await bvs.deploymentTransaction().wait()).blockNumber;
  console.log("BVS deployed to:", address, "at block", deployBlock);

  // Build a RELAYER POOL: multiple accounts that can submit votes in parallel.
  // On Ganache these are the node's unlocked accounts (signers[1..]). The
  // backend round-robins across them so high vote volume isn't bottlenecked on
  // a single account's nonce sequence.
  const signers = await hre.ethers.getSigners();
  const poolSize = Math.max(1, Math.min(Number(process.env.RELAYER_POOL_SIZE || 4), signers.length - 1));

  // Collect candidate addresses (node signers 1..N), deduped case-insensitively.
  const seen = new Set();
  const pool = [];
  const add = (addr) => {
    if (!addr) return;
    const k = addr.toLowerCase();
    if (seen.has(k) || k === deployer.address.toLowerCase()) return;
    seen.add(k);
    pool.push(addr);
  };
  // Primary first (use the node's checksummed address if RELAYER_ADDRESS matches signer[1]).
  if (process.env.RELAYER_ADDRESS) add(process.env.RELAYER_ADDRESS);
  for (let i = 1; i <= poolSize && i < signers.length; i++) add(signers[i].address);

  const primary = pool[0] || deployer.address;
  if (primary.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await bvs.setRelayer(primary)).wait();
    console.log("Primary relayer set to:", primary);
  }
  for (const addr of pool) {
    await (await bvs.addRelayer(addr)).wait();
  }
  console.log("Relayer pool:", pool);

  // Optionally grant the official role to extra addresses (comma-separated).
  const extraOfficials = (process.env.EXTRA_OFFICIALS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const account of extraOfficials) {
    const tx = await bvs.addOfficial(account);
    await tx.wait();
    console.log("Official added:", account);
  }

  // Write address + ABI to a shared file consumed by backend and frontend.
  const artifact = await hre.artifacts.readArtifact("BVS");
  const out = {
    address,
    network: hre.network.name,
    deployer: deployer.address,
    relayer: primary,
    relayerPool: pool,
    deployBlock,
    abi: artifact.abi,
  };

  const sharedDir = path.join(__dirname, "..", "..", "shared");
  fs.mkdirSync(sharedDir, { recursive: true });
  const outPath = path.join(sharedDir, "BVS.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote deployment info to:", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
