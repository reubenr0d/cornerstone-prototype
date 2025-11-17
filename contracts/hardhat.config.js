require("@nomicfoundation/hardhat-toolbox");
// Explicitly include verify plugin to ensure latest (Etherscan API v2)
require("@nomicfoundation/hardhat-verify");
require("solidity-coverage");
require('dotenv').config();

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,  // Enable IR-based optimizer to fix "stack too deep" errors
    },
  },
  networks: {
    // Force local Hardhat chainId to 1337 to match MetaMask
    hardhat: {
      chainId: 1337,
    },
    localhost: {
      chainId: 1337,
    },
    // Via Blockscout proxy (same-origin through nginx)
    'local-hardhat': {
      url: 'http://localhost:8080/api/eth-rpc',
      chainId: 1337,
    },
    sepolia: {
      // Configure via env: SEPOLIA_RPC_URL and PRIVATE_KEY
      url: process.env.SEPOLIA_RPC_URL || "",
      chainId: 11155111,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    // Etherscan API v2: use a single apiKey string
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    // Custom explorers (e.g., local Blockscout) remain configured via customChains
    customChains: [
      {
        network: "localhost",
        chainId: 1337,
        urls: {
          apiURL: "http://localhost:4000/api",
          browserURL: "http://localhost:8080",
        },
      },
      {
        network: "local-hardhat",
        chainId: 1337,
        urls: {
          apiURL: "http://localhost:4000/api",
          browserURL: "http://localhost:8080",
        },
      },
    ],
  },
  // Silence Sourcify notice (enable if you want dual verification)
  sourcify: { enabled: false },
  paths: {
    // Compile sources from the local src directory to avoid scanning node_modules
    sources: "./src",
  },
};
