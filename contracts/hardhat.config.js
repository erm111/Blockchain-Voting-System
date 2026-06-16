require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Default Ganache RPC. Ganache GUI commonly uses port 7545; the CLI uses 8545.
const GANACHE_RPC = process.env.GANACHE_RPC || "http://127.0.0.1:7545";

// Optional: a specific deployer private key. If omitted, Hardhat will use the
// network's available accounts (Ganache exposes its accounts over RPC).
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

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
  },
};
