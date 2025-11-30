/* eslint-disable no-console */
const { ethers } = require("ethers");
const retry = require("p-retry").default || require("p-retry");
require("dotenv").config();

const RPC_URL = process.env.RPC_URL;
const REGISTRY_ADDRESS = (process.env.REGISTRY_ADDRESS || "").trim();
const START_BLOCK = Number(process.env.START_BLOCK || 0);
const PROJECT_ADDRESSES = (process.env.PROJECT_ADDRESSES || "")
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean);
const IPFS_GATEWAYS = (process.env.IPFS_GATEWAYS || "https://w3s.link/ipfs/,https://ipfs.io/ipfs/")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

if (!RPC_URL) {
  throw new Error("RPC_URL is required");
}
if (!REGISTRY_ADDRESS && !PROJECT_ADDRESSES.length) {
  throw new Error("Set REGISTRY_ADDRESS or PROJECT_ADDRESSES");
}

// Prefer EigenCloud-injected mnemonic, fallback to local private key for dev
const mnemonic = process.env.MNEMONIC;
const pk = process.env.WORKER_PRIVATE_KEY;
if (!mnemonic && !pk) {
  throw new Error("Set MNEMONIC (EigenCloud) or WORKER_PRIVATE_KEY (local)");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = mnemonic
  ? ethers.Wallet.fromPhrase(mnemonic, provider)
  : new ethers.Wallet(pk, provider);

const VERIFICATION_ABI = [
  "event VerificationRequested(bytes32 indexed jobId, address indexed project, uint8 phaseId, uint256 docIndex, string docUri, bytes32 docHash)",
  "function setVerificationResult(bytes32 jobId, bytes32 docHash, bool success) external",
];

const REGISTRY_ABI = [
  "event ProjectCreated(address indexed project, address indexed token, address indexed creator, string metadataURI)",
];

const handlers = new Map();
const attachedProjects = new Set();

function log(level, msg, meta = {}) {
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };
  if ((levels[level] ?? 2) > (levels[LOG_LEVEL] ?? 2)) return;
  console.log(JSON.stringify({ level, msg, ...meta, ts: new Date().toISOString() }));
}

function gatewayUrl(uri, gateway) {
  if (uri.startsWith("ipfs://")) {
    const path = uri.replace("ipfs://", "");
    return `${gateway.replace(/\/+$/, "")}/${path}`;
  }
  return uri;
}

async function fetchPdf(uri) {
  return retry(
    async () => {
      let lastErr;
      for (const gw of IPFS_GATEWAYS) {
        const url = gatewayUrl(uri, gw);
        try {
          const res = await fetch(url);
          if (!res.ok) {
            lastErr = new Error(`HTTP ${res.status}`);
            continue;
          }
          const arrayBuf = await res.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          return buf;
        } catch (err) {
          lastErr = err;
          log("warn", "fetch failed", { url, error: err?.message });
        }
      }
      throw lastErr || new Error("all gateways failed");
    },
    { retries: 3, minTimeout: 1500 }
  );
}

// Placeholder verification hook; replace with real logic when available
async function verifyDocument(_pdfBuf, _meta) {
  return true;
}

async function processJob(contract, event) {
  const [jobId, , phaseId, docIndex, docUri, docHash] = event.args;
  const jobKey = jobId.toLowerCase();
  if (handlers.get(jobKey)) {
    return;
  }
  handlers.set(jobKey, true);

  const meta = {
    jobId,
    phaseId: Number(phaseId),
    docIndex: Number(docIndex),
    docUri,
    docHash,
  };

  log("info", "job.received", meta);
  try {
    const pdfBuf = await fetchPdf(docUri);
    const rehashed = ethers.keccak256(pdfBuf);
    if (rehashed !== ethers.hexlify(docHash)) {
      throw new Error(`docHash mismatch: expected ${docHash}, got ${rehashed}`);
    }
    const verificationSucceeded = await verifyDocument(pdfBuf, meta);
    const tx = await contract.connect(signer).setVerificationResult(jobId, docHash, verificationSucceeded);
    await tx.wait();
    log("info", "job.completed", { ...meta, txHash: tx.hash, success: verificationSucceeded });
  } catch (err) {
    log("error", "job.failed", { ...meta, error: err?.message });
  } finally {
    handlers.delete(jobKey);
  }
}

async function attachProject(addr) {
  const address = ethers.getAddress(addr);
  if (attachedProjects.has(address)) return;
  attachedProjects.add(address);
  const contract = new ethers.Contract(address, VERIFICATION_ABI, provider);
  contract.on("VerificationRequested", (...args) => {
    const event = args[args.length - 1];
    processJob(contract, event);
  });
  log("info", "project.listen", { address });
}

async function main() {
  log("info", "starting worker", {
    signer: await signer.getAddress(),
    registry: REGISTRY_ADDRESS || null,
    projectsSeed: PROJECT_ADDRESSES,
    gateways: IPFS_GATEWAYS,
    startBlock: START_BLOCK,
  });

  // Seed with configured projects
  for (const addr of PROJECT_ADDRESSES) {
    await attachProject(addr);
  }

  // Discover from registry: backfill + live
  if (REGISTRY_ADDRESS) {
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
    // Backfill existing projects
    try {
      const filter = registry.filters.ProjectCreated();
      const events = await registry.queryFilter(filter, START_BLOCK || undefined, "latest");
      for (const ev of events) {
        const addr = ev.args[0];
        await attachProject(addr);
      }
      log("info", "registry.backfill.complete", { count: events.length });
    } catch (err) {
      log("warn", "registry.backfill.error", { error: err?.message });
    }

    // Live subscription
    registry.on("ProjectCreated", async (project /*token, creator, uri*/, _token, _creator, _uri) => {
      await attachProject(project);
    });
    log("info", "registry.listen", { address: REGISTRY_ADDRESS });
  }
}

main().catch((err) => {
  log("error", "fatal", { error: err?.message });
  process.exit(1);
});
