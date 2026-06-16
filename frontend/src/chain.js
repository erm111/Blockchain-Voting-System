import { ethers } from "ethers";
import { api } from "./api";

const RPC = import.meta.env.VITE_GANACHE_RPC || "http://127.0.0.1:7545";

let _meta = null;
export async function contractMeta() {
  if (!_meta) _meta = await api("/api/contract");
  return _meta;
}

// Read-only contract via Ganache RPC (no wallet needed: voters, results).
export async function readContract() {
  const { address, abi } = await contractMeta();
  const provider = new ethers.JsonRpcProvider(RPC);
  return new ethers.Contract(address, abi, provider);
}

// Connect MetaMask (officials only). Returns { signer, address }.
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("MetaMask not found. Install it and connect to your Ganache network.");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}

export async function writeContract(signer) {
  const { address, abi } = await contractMeta();
  return new ethers.Contract(address, abi, signer);
}

export const STATUS = ["Created", "Active", "Ended"];

const n = (x) => Number(x);

// Load a full election (positions + candidates) in just TWO RPC calls,
// regardless of how many positions/candidates exist (was O(positions*candidates)).
export async function loadElection(contract, id) {
  const [e, results] = await Promise.all([contract.getElection(id), contract.getResults(id)]);
  const positions = results.map((p) => ({
    id: n(p.id),
    name: p.name,
    candidates: p.candidates.map((c) => ({ id: n(c.id), name: c.name, voteCount: n(c.voteCount) })),
  }));
  return {
    id: n(e.id),
    name: e.name,
    status: n(e.status),
    statusLabel: STATUS[n(e.status)],
    startTime: n(e.startTime),
    endTime: n(e.endTime),
    timeExpired: e.timeExpired,
    positions,
  };
}

export async function loadAllElections(contract) {
  const count = n(await contract.electionCount());
  const list = [];
  for (let id = 1; id <= count; id++) {
    list.push(await loadElection(contract, id));
  }
  return list;
}
