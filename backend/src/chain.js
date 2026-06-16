const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC = process.env.GANACHE_RPC || "http://127.0.0.1:7545";
const DEPLOYMENT_FILE = process.env.DEPLOYMENT_FILE || "../shared/BVS.json";

function loadDeployment() {
  const p = path.isAbsolute(DEPLOYMENT_FILE)
    ? DEPLOYMENT_FILE
    : path.join(__dirname, "..", DEPLOYMENT_FILE);
  if (!fs.existsSync(p)) {
    throw new Error(
      `Deployment file not found at ${p}. Deploy the contract first ` +
        `(cd contracts && npm run deploy).`
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

let _state = null;

function chain() {
  if (_state) return _state;

  const deployment = loadDeployment();
  const provider = new ethers.JsonRpcProvider(RPC);

  // Read-only contract (no signer): all view calls go through here.
  const contract = new ethers.Contract(deployment.address, deployment.abi, provider);

  // Build the RELAYER POOL. Each signer is wrapped in a NonceManager so we can
  // fire many votes concurrently without nonce collisions; the pool spreads load
  // across multiple accounts for parallel inclusion.
  let voteContracts;
  if (process.env.RELAYER_PRIVATE_KEY) {
    // Explicit key (e.g. a public testnet, single signer).
    const signer = new ethers.NonceManager(new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider));
    voteContracts = [new ethers.Contract(deployment.address, deployment.abi, signer)];
  } else {
    const pool =
      Array.isArray(deployment.relayerPool) && deployment.relayerPool.length
        ? deployment.relayerPool
        : [deployment.relayer];
    voteContracts = pool.map((addr) => {
      const signer = new ethers.NonceManager(new ethers.JsonRpcSigner(provider, addr));
      return new ethers.Contract(deployment.address, deployment.abi, signer);
    });
  }

  let rr = 0;
  const nextVote = () => voteContracts[rr++ % voteContracts.length];

  _state = { provider, contract, voteContracts, nextVote, deployment };
  return _state;
}

module.exports = { chain, loadDeployment };
