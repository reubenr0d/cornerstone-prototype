require("@nomicfoundation/hardhat-toolbox");
require("solidity-coverage");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
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
  },
  etherscan: {
    // Configure Blockscout’s Etherscan‑compatible API for the local explorer
    apiKey: {
      localhost: "blockscout",
      'local-hardhat': 'empty',
    },
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
  paths: {
    // Compile sources from the local src directory to avoid scanning node_modules
    sources: "./src",
  },
};
