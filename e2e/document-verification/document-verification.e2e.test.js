const { expect } = require("chai");
const { ethers } = require("ethers");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");
const EIGENCLOUD_DIR = path.join(ROOT, "eigencloud");
const DEPLOYMENT_DIR = path.join(__dirname, ".deployments");
const DEPLOYMENT_FILE = path.join(DEPLOYMENT_DIR, "document-verification.json");
const SAMPLE_PDF_PATH = path.join(ROOT, "documents", "title.pdf");

// Use actual Title Document URL
const TITLE_DOCUMENT_URL = "https://files.catbox.moe/fe9fah.pdf";
const EXPECTED_ADDRESS = "SEKIGO DEVELOPMENTS CORPORATION, INC.NO. BC1234606 PO BOX 97198 DELTA RPO SCOTTSDALE MALL, BC V4E 0A7";

const RPC_URL = process.env.E2E_RPC_URL || "http://127.0.0.1:8546";
const RPC = new URL(RPC_URL);

// Hardhat default funded accounts (first two)
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const INVESTOR_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const WORKER_PK = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

// DocID enum - must match contract
const DocID = {
  TITLE_DOCUMENT: 0,
  TITLE_INSURANCE: 1,
  NEW_HOME_REGISTRATION: 2,
  WARRANTY_ENROLMENT: 3,
  DEMOLITION_PERMIT: 4,
  ABATEMENT_PERMIT: 5,
  BUILDING_PERMIT: 6,
  OCCUPANCY_PERMIT: 7,
  APPRAISER_REPORTS: 8,
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`Command failed (${cmd} ${args.join(" ")}): ${stderr || stdout}`));
    });
  });
}

function startHardhatNode() {
  const child = spawn("npx", ["hardhat", "node", "--hostname", RPC.hostname, "--port", RPC.port || "8546"], {
    cwd: CONTRACTS_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  child.stdout?.on("data", (d) => process.stdout.write(`[hardhat] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[hardhat] ${d}`));
  return child;
}

function startEigenWorker(registryAddress) {
  const child = spawn("node", ["src/worker.js"], {
    cwd: EIGENCLOUD_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      RPC_URL,
      REGISTRY_ADDRESS: registryAddress,
      START_BLOCK: "0",
      WORKER_PRIVATE_KEY: WORKER_PK,
      PROJECT_ADDRESSES: "",
      LOG_LEVEL: "debug",
    },
  });
  child.stdout?.on("data", (d) => process.stdout.write(`[worker] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[worker] ${d}`));
  return child;
}

async function waitForRpc() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  for (let i = 0; i < 40; i++) {
    try {
      await provider.getBlockNumber();
      return provider;
    } catch (err) {
      await delay(500);
    }
  }
  throw new Error("Hardhat node did not start in time");
}

function loadArtifact(subdir, name) {
  const artifactPath = path.join(CONTRACTS_DIR, "artifacts", "src", subdir, `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function deployContract(artifact, signer, params = []) {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const nonce = await signer.getNonce("pending");
  const contract = await factory.deploy(...params, { nonce });
  await contract.waitForDeployment();
  await delay(1000);
  return contract;
}

async function waitFor(conditionFn, timeoutMs = 60000, intervalMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await conditionFn()) return true;
    await delay(intervalMs);
  }
  return false;
}

// Helper function to fetch and hash the title document
async function fetchTitleDocument() {
  const response = await fetch(TITLE_DOCUMENT_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch title document: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const docHash = ethers.keccak256(buffer);
  return { buffer, docHash };
}

describe("Document verification E2E with Address Extraction", function () {
  this.timeout(180000);

  let nodeProc;
  let workerProc;
  let provider;
  let deployer;
  let investor;
  let workerWallet;
  let registry;
  let project;
  let deployment;

  before(async () => {
    console.log("\n=== Setting up E2E test ===");
    console.log("Expected address:", EXPECTED_ADDRESS);
    console.log("Title document URL:", TITLE_DOCUMENT_URL);
    
    // Compile contracts to pull fresh artifacts
    await runCommand("npm", ["run", "compile"], { cwd: CONTRACTS_DIR });

    const reuseNode = process.env.E2E_REUSE_NODE === "1";
    if (!reuseNode) {
      nodeProc = startHardhatNode();
    }
    provider = await waitForRpc();

    deployer = new ethers.NonceManager(new ethers.Wallet(DEPLOYER_PK, provider));
    investor = new ethers.NonceManager(new ethers.Wallet(INVESTOR_PK, provider));
    workerWallet = new ethers.NonceManager(new ethers.Wallet(WORKER_PK, provider));
    const deployerAddress = await deployer.getAddress();
    const investorAddress = await investor.getAddress();
    const workerAddress = await workerWallet.getAddress();

    const registryArtifact = loadArtifact("core", "ProjectRegistry");
    const projectArtifact = loadArtifact("core", "CornerstoneProject");
    const mockArtifact = loadArtifact("mocks", "MockPYUSD");

    // Fetch the actual title document
    console.log("\n=== Fetching title document ===");
    const { buffer, docHash } = await fetchTitleDocument();
    console.log("Document hash:", docHash);
    console.log("Document size:", buffer.length, "bytes");

    // Attempt to reuse an existing deployment if it exists on-chain
    if (fs.existsSync(DEPLOYMENT_FILE)) {
      const stored = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
      const code = await provider.getCode(stored.registry);
      if (code && code !== "0x") {
        deployment = stored;
        const jobCheck = stored.jobId
          ? await new ethers.Contract(stored.project, projectArtifact.abi, deployer).verificationJobs(stored.jobId)
          : null;
        if (!jobCheck || jobCheck.docHash?.toLowerCase() !== stored.docHash.toLowerCase()) {
          deployment = null;
        }
      }
    }

    if (!deployment) {
      console.log("\n=== Deploying contracts ===");
      const stablecoin = await deployContract(mockArtifact, deployer, []);
      const registryContract = await deployContract(registryArtifact, deployer, []);
      registry = registryContract.connect(deployer);

      // Configure registry verifier to the worker signer before project creation
      await (await registry.setVerifier(workerAddress)).wait();
      console.log("Registry verifier set to:", workerAddress);

      // Start worker early to catch the upcoming ProjectCreated event live
      workerProc = startEigenWorker(await registry.getAddress());
      await delay(1000);

      // Create project through registry (uses registry verifier)
      console.log("\n=== Creating project ===");
      const minRaise = 1_000_000n; // 1 token with 6 decimals
      const maxRaise = 2_000_000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const aprs = [0, 500, 500, 500, 500, 0];
      const durations = [0, 0, 0, 0, 0, 0];
      const caps = [0, 2000, 2000, 2000, 2000, 1000];
      const createTx = await registry.createProjectWithTokenMeta(
        await stablecoin.getAddress(),
        "Cornerstone Title Verification",
        "CST-TITLE",
        minRaise,
        maxRaise,
        deadline,
        aprs,
        durations,
        caps,
        "ipfs://title-verification-project"
      );
      const createRc = await createTx.wait();
      const events = await registry.queryFilter(
        registry.filters.ProjectCreated(),
        createRc.blockNumber,
        createRc.blockNumber
      );
      expect(events[0]).to.exist;
      const projectAddress = events[0].args.project;
      project = new ethers.Contract(projectAddress, projectArtifact.abi, deployer);
      console.log("Project created at:", projectAddress);

      // Mint and deposit enough stablecoin to satisfy minimum raise
      console.log("\n=== Funding project ===");
      await (await stablecoin.mint(investorAddress, minRaise)).wait();
      await (await stablecoin.connect(investor).approve(projectAddress, minRaise)).wait();
      await (await project.connect(investor).deposit(minRaise)).wait();
      console.log("Minimum raise satisfied");

      // Close fundraising phase (phase 0) with the actual title document
      const buffer = fs.readFileSync(SAMPLE_PDF_PATH);
      const base64 = buffer.toString("base64");
      const docUri = `data:application/pdf;base64,${base64}`;
      const phaseId = 0;
      
      console.log("\n=== Closing phase 0 with title document ===");
      const closeTx = await project.closePhase(
        phaseId,                    // uint8 phaseId
        [DocID.TITLE_DOCUMENT],       // DocID docId - THIS WAS MISSING!
        ["pdf"],                    // string[] docTypes
        [docHash],                  // bytes32[] docHashes
        [docUri]                    // string[] metadataURIs
      );
      const closeRc = await closeTx.wait();
      console.log("Phase closed, verification job created");
      
      // Calculate jobId using the correct parameters (matching contract's _jobId function)
      const jobId = ethers.solidityPackedKeccak256(
        ["address", "uint8", "bytes32"],
        [await project.getAddress(), DocID.TITLE_DOCUMENT, docHash]
      );
      console.log("Job ID:", jobId);

      deployment = {
        registry: await registry.getAddress(),
        project: projectAddress,
        stablecoin: await stablecoin.getAddress(),
        docHash,
        docUri,
        jobId,
      };
      fs.mkdirSync(DEPLOYMENT_DIR, { recursive: true });
      fs.writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2));
    } else {
      console.log("\n=== Reusing existing deployment ===");
      registry = new ethers.Contract(deployment.registry, registryArtifact.abi, deployer);
      project = new ethers.Contract(deployment.project, projectArtifact.abi, deployer);
      workerProc = startEigenWorker(deployment.registry);
    }

    if (!workerProc) {
      workerProc = startEigenWorker(await registry.getAddress());
    }
    
    console.log("\n=== Setup complete, waiting for verification ===\n");
  });

  after(async () => {
    workerProc?.kill("SIGINT");
    nodeProc?.kill("SIGINT");
  });

  it("verifies title document and extracts property owner address", async () => {
    const { jobId, docHash } = deployment;

    console.log("\n=== Waiting for Eigen worker to process verification ===");
    console.log("Job ID:", jobId);
    console.log("Doc Hash:", docHash);

    // Wait for the Eigen worker to process verification
    const completed = await waitFor(async () => {
      const job = await project.verificationJobs(jobId);
      return job.completed;
    }, 90000, 3000);

    expect(completed).to.equal(true, "verification job did not complete in time");
    
    const job = await project.verificationJobs(jobId);
    
    console.log("\n=== Verification Results ===");
    console.log("Job completed:", job.completed);
    console.log("Verification success:", job.success);
    console.log("Document hash:", job.docHash);
    console.log("Extracted text:", job.extractedText);
    
    // The contract field is named 'extractedText' (index 5 in the struct)
    const extractedAddress = job.extractedText || "";
    console.log("\n=== Expected Address ===");
    console.log(EXPECTED_ADDRESS);
    console.log("\n=== Address Match ===");
    
    // Basic assertions
    expect(job.success).to.equal(true, "verification reported failure");
    expect(job.docHash).to.equal(docHash, "document hash mismatch");
    expect(extractedAddress).to.exist;
    expect(extractedAddress.length).to.be.greaterThan(0, "extracted address is empty");
    
    // Normalize both addresses for comparison (remove extra spaces, make comparison case-insensitive)
    const normalizeAddress = (addr) => addr.replace(/\s+/g, " ").trim().toUpperCase();
    const extractedNormalized = normalizeAddress(extractedAddress);
    const expectedNormalized = normalizeAddress(EXPECTED_ADDRESS);
    
    console.log("Extracted (normalized):", extractedNormalized);
    console.log("Expected (normalized):", expectedNormalized);
    
    // Check if extracted address contains key components
    expect(extractedNormalized).to.include("SEKIGO DEVELOPMENTS CORPORATION", 
      "extracted address should contain company name");
    expect(extractedNormalized).to.include("BC1234606", 
      "extracted address should contain corporation number");
    expect(extractedNormalized).to.include("PO BOX 97198", 
      "extracted address should contain PO Box");
    expect(extractedNormalized).to.include("V4E 0A7", 
      "extracted address should contain postal code");
    
    console.log("\nAll assertions passed!");
    console.log("Address successfully extracted and verified!");
  });
});
