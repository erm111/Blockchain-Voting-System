require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Default Ganache RPC. Ganache GUI commonly uses port 7545; the CLI uses 8545.
const GANACHE_RPC = process.env.GANACHE_RPC || "http://127.0.0.1:7545";

// Optional: a specific deployer private key. If omitted, Hardhat will use the
// network's available accounts (Ganache exposes its accounts over RPC).
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// Sepolia (public Ethereum testnet). A public RPC is used by default so no
// signup is required; set SEPOLIA_RPC_URL to an Alchemy/Infura URL for reliability.
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

// Deployer first, then (optionally) a separate relayer account as signer[1].
const sepoliaAccounts = [DEPLOYER_PRIVATE_KEY, RELAYER_PRIVATE_KEY].filter(Boolean);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    ganache: {
      url: GANACHE_RPC,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: sepoliaAccounts,
      chainId: 11155111,
    },
  },
  // For `npx hardhat verify --network sepolia <address>` (free key from etherscan.io).
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};
