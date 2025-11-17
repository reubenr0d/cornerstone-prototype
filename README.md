# Cornerstone - Tokenized Real Estate Investment Protocol

> **ETHGlobal Hackathon Project** - A milestone-based funding platform for real estate development with cross-chain capabilities, automated liquidity management, and rich on-chain data indexing.

## 🏗️ Overview

Cornerstone is a revolutionary tokenized real estate investment protocol that enables transparent, milestone-based funding for property development projects. Built for ETHGlobal, it combines **Avail SDK** for cross-chain interoperability, **Vincent** for automated liquidity pool management, and **Envio** for comprehensive blockchain data indexing.

Vincent Autobalancing LP: https://github.com/reubenr0d/cornerstone-vincent

### Key Features

- **🎯 Milestone-Based Funding**: 6-phase development lifecycle with escrow protection
- **🌐 Cross-Chain Integration**: Avail Nexus SDK for seamless multi-chain deposits
- **⚖️ Automated LP Management**: Vincent protocol for liquidity pool autobalancing
- **📊 Rich Data Analytics**: Envio indexer for comprehensive project insights
- **🔒 On-Chain Verification**: Cryptographic document verification and immutable records
- **💰 Dynamic Interest Accrual**: Phase-based APR with compounding returns

## 🛠️ Tech Stack

### Core Technologies
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Smart Contracts**: Solidity + Hardhat + OpenZeppelin
- **Blockchain**: Ethereum Sepolia + Avail Nexus
- **Data Indexing**: Envio GraphQL API
- **LP Management**: Vincent Protocol Integration

### Key Integrations
- **@avail-project/nexus-core**: Cross-chain asset transfers
- **Envio Indexer**: Real-time blockchain event indexing
- **Vincent Protocol**: Automated liquidity pool management
- **Uniswap V3**: DEX integration for token trading

## 🔄 How It Works

### 1. Project Lifecycle (6 Phases)

**Phase 0: Fundraising**
- Open fundraising with min/max raise targets
- No interest accrual during fundraising
- Early investors get future interest bonuses

**Phases 1-4: Development**
- Design & Architectural (15% APR)
- Permitting (12% APR) 
- Abatement/Demolition (9% APR)
- Construction (5% APR)

**Phase 5: Revenue & Sales**
- Progressive unlock via appraisal reports
- Sales proceeds distribution
- Principal redemption and revenue claims



## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm/yarn
- MetaMask or compatible wallet
- Sepolia ETH for gas

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd cornerstone-prototype
```

2. **Install dependencies**
```bash
# Root dependencies
npm install

# App dependencies
cd app && npm install

# Contract dependencies
cd ../contracts && npm install

# Indexer dependencies
cd ../indexer && npm install
```

3. **Environment Setup**
```bash
# Copy environment template
cp .env.example .env.local

# Configure your environment variables
VITE_RPC_URL=https://rpc.sepolia.org
VITE_USDC_ADDRESS=0x...
VITE_REGISTRY_ADDRESS=0x...
```

### Development

1. **Start the frontend**
```bash
cd app
npm run dev
```

2. **Deploy contracts (if needed)**
```bash
cd contracts
npm run deploy:sepolia
```

3. **Start the indexer**
```bash
cd indexer
npm run start
```

## 🔧 Smart Contract Details

### Core Contracts

**ProjectRegistry.sol**
- Factory contract for deploying new projects
- Custom token metadata support
- Project discovery and listing

**CornerstoneProject.sol**
- Main project lifecycle management
- 6-phase development system
- Interest accrual and distribution
- Revenue routing and principal redemption

**CornerstoneToken.sol**
- ERC-20 share tokens (6 decimals)
- Transfer hooks for fair distribution
- DEX trading compatibility

## 📈 Business Model

### Revenue Streams
- **Platform Fees**: Small percentage on successful projects
- **Interest Spread**: Difference between earned and paid interest
- **LP Fees**: Automated liquidity provision returns

### Token Economics
- **Project Tokens**: ERC-20 shares representing ownership
- **Liquidity Tokens**: LP tokens for automated management
- **Governance**: Future DAO token for protocol governance

## 🌐 Deployment

### Testnet (Sepolia)
- **Registry**: `0x832d9D61E076791Ae7c625C27Ab1Ca4D7499f6cb`
- **USDC**: MockUSDC for testing
- **RPC**: Sepolia testnet


## 🙏 Acknowledgments

- **ETHGlobal**: Hackathon platform and community
- **Avail**: Cross-chain infrastructure
- **Vincent**: LP management protocol
- **Envio**: Blockchain data indexing
- **OpenZeppelin**: Security patterns and standards

---

**Built with ❤️ for ETHGlobal Hackathon**

*Transforming real estate investment through blockchain technology*