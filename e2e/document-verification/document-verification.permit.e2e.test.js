const { expect } = require("chai");
const { ethers } = require("ethers");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");
const EIGENCLOUD_DIR = path.join(ROOT, "eigencloud");
const DEPLOYMENT_DIR = path.join(__dirname, ".deployments");
const DEPLOYMENT_FILE = path.join(DEPLOYMENT_DIR, "permit-verification.json");

// Use random document URL (not a real permit) for negative tests
const RANDOM_DOCUMENT_URL = "https://files.catbox.moe/o08bu7.pdf";

// Use real Vancouver permit document for positive test
const VALID_PERMIT_URL = "https://files.catbox.moe/mosx92.pdf";

const RPC_URL = process.env.E2E_RPC_URL || "http://127.0.0.1:8546";
const RPC = new URL(RPC_URL);

// Hardhat default funded accounts (first three)
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const INVESTOR_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const WORKER_PK = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

// DocID enum - must match contract
const DocID = {
    TITLE_DOCUMENT: 0,
    TITLE_INSURANCE: 1,
    DESIGN_PLAN: 2,
    NEW_HOME_REGISTRATION: 3,
    WARRANTY_ENROLMENT: 4,
    DEMOLITION_PERMIT: 5,
    ABATEMENT_PERMIT: 6,
    BUILDING_PERMIT: 7,
    OCCUPANCY_PERMIT: 8,
    APPRAISER_REPORTS: 9,
};

const PERMIT_DOC_IDS = [
  DocID.DEMOLITION_PERMIT,
  DocID.ABATEMENT_PERMIT,
  DocID.BUILDING_PERMIT,
  DocID.OCCUPANCY_PERMIT,
];

const PERMIT_NAMES = {
  [DocID.DEMOLITION_PERMIT]: "Demolition Permit",
  [DocID.ABATEMENT_PERMIT]: "Abatement Permit",
  [DocID.BUILDING_PERMIT]: "Building Permit",
  [DocID.OCCUPANCY_PERMIT]: "Occupancy Permit",
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

// Helper function to fetch and hash a document
async function fetchDocument(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const docHash = ethers.keccak256(buffer);
  return { buffer, docHash };
}

describe("Permit Document Verification E2E - Negative Tests", function () {
  this.timeout(240000); // 4 minutes for all permit types

  let nodeProc;
  let workerProc;
  let provider;
  let deployer;
  let investor;
  let workerWallet;
  let registry;
  let project;
  let deployment;
  let documentHash;
  let documentBuffer;

  before(async () => {
    console.log("\n=== Setting up E2E test for permit verification (NEGATIVE) ===");
    console.log("Random document URL:", RANDOM_DOCUMENT_URL);
    console.log("Testing DocIDs:", PERMIT_DOC_IDS.map(id => `${id} (${PERMIT_NAMES[id]})`).join(", "));
    
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
    const workerAddress = await workerWallet.getAddress();

    const registryArtifact = loadArtifact("core", "ProjectRegistry");
    const projectArtifact = loadArtifact("core", "CornerstoneProject");
    const mockArtifact = loadArtifact("mocks", "MockPYUSD");

    // Fetch the random document
    console.log("\n=== Fetching random document ===");
    const { buffer, docHash } = await fetchDocument(RANDOM_DOCUMENT_URL);
    documentHash = docHash;
    documentBuffer = buffer;
    console.log("Document hash:", docHash);
    console.log("Document size:", buffer.length, "bytes");

    console.log("\n=== Deploying contracts ===");
    const stablecoin = await deployContract(mockArtifact, deployer, []);
    const registryContract = await deployContract(registryArtifact, deployer, []);
    registry = registryContract.connect(deployer);

    // Configure registry verifier to the worker signer
    await (await registry.setVerifier(workerAddress)).wait();
    console.log("Registry verifier set to:", workerAddress);

    // Start worker to catch ProjectCreated event
    workerProc = startEigenWorker(await registry.getAddress());
    await delay(1000);

    // Create project through registry
    console.log("\n=== Creating project ===");
    const minRaise = 1_000_000n;
    const maxRaise = 2_000_000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const aprs = [0, 500, 500, 500, 500, 0];
    const durations = [0, 0, 0, 0, 0, 0];
    const caps = [0, 2000, 2000, 2000, 2000, 1000];
    
    const createTx = await registry.createProjectWithTokenMeta(
      await stablecoin.getAddress(),
      "Cornerstone Permit Verification",
      "CST-PERMIT",
      minRaise,
      maxRaise,
      deadline,
      aprs,
      durations,
      caps,
      "ipfs://permit-verification-project"
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

    // Fund project to satisfy minimum raise
    console.log("\n=== Funding project ===");
    const investorAddress = await investor.getAddress();
    await (await stablecoin.mint(investorAddress, minRaise)).wait();
    await (await stablecoin.connect(investor).approve(projectAddress, minRaise)).wait();
    await (await project.connect(investor).deposit(minRaise)).wait();
    console.log("Minimum raise satisfied");

    // Close phase 0 to move to phase 1
    console.log("\n=== Closing phase 0 ===");
    const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
    const closeTx = await project.closePhase(
      0,
      [DocID.TITLE_DOCUMENT],
      ["pdf"],
      [dummyHash],
      ["ipfs://dummy"]
    );
    await closeTx.wait();
    console.log("Phase 0 closed, now in phase 1");

    deployment = {
      registry: await registry.getAddress(),
      project: projectAddress,
      stablecoin: await stablecoin.getAddress(),
    };

    console.log("\n=== Setup complete ===\n");
  });

  after(async () => {
    workerProc?.kill("SIGINT");
    nodeProc?.kill("SIGINT");
  });

  // Test each permit type (DocID 4-7) with random document
  PERMIT_DOC_IDS.forEach((docId) => {
    it(`should fail verification for ${PERMIT_NAMES[docId]} (DocID ${docId}) with random document`, async function() {
      this.timeout(90000); // 90 seconds per test
      
      console.log(`\n=== Testing ${PERMIT_NAMES[docId]} (DocID ${docId}) - NEGATIVE ===`);
      
      // Encode document as data URI
      const base64 = documentBuffer.toString("base64");
      const docUri = `data:application/pdf;base64,${base64}`;
      
      // Get current phase to close it with this permit
      const currentPhase = await project.currentPhase();
      console.log(`Current phase: ${currentPhase}`);
      
      // Close current phase with the permit document
      console.log(`Closing phase ${currentPhase} with ${PERMIT_NAMES[docId]}...`);
      const closeTx = await project.closePhase(
        currentPhase,
        [docId],
        ["pdf"],
        [documentHash],
        [docUri]
      );
      const closeRc = await closeTx.wait();
      console.log(`Phase ${currentPhase} closed with permit verification job`);
      
      // Calculate jobId
      const jobId = ethers.solidityPackedKeccak256(
        ["address", "uint8", "bytes32"],
        [await project.getAddress(), docId, documentHash]
      );
      console.log("Job ID:", jobId);
      console.log("Doc Hash:", documentHash);
      
      console.log("\n=== Waiting for worker to process verification ===");
      
      // Wait for verification to complete
      const completed = await waitFor(async () => {
        const job = await project.verificationJobs(jobId);
        return job.completed;
      }, 60000, 3000);
      
      expect(completed).to.equal(true, `verification job for ${PERMIT_NAMES[docId]} did not complete in time`);
      
      const job = await project.verificationJobs(jobId);
      
      console.log("\n=== Verification Results ===");
      console.log("Job completed:", job.completed);
      console.log("Verification success:", job.success);
      console.log("Document hash:", job.docHash);
      console.log("DocID:", job.docId);
      console.log("Extracted text:", job.extractedText);
      
      // Assertions - verification should FAIL for random document
      expect(job.completed).to.equal(true, 
        `${PERMIT_NAMES[docId]}: verification should be completed`);
      
      expect(job.success).to.equal(false, 
        `${PERMIT_NAMES[docId]}: verification should FAIL for random document (no matching permit in Vancouver API)`);
      
      expect(job.docHash).to.equal(documentHash, 
        `${PERMIT_NAMES[docId]}: document hash should match`);
      
      expect(Number(job.docId)).to.equal(docId, 
        `${PERMIT_NAMES[docId]}: docId should match`);
      
      console.log(`\n✓ ${PERMIT_NAMES[docId]} correctly failed verification (no matching permit found)`);
    });
  });

  it("should verify that all permit types were tested (negative)", async () => {
    console.log("\n=== Summary (Negative Tests) ===");
    console.log(`Tested ${PERMIT_DOC_IDS.length} permit document types`);
    console.log("All verifications correctly failed for random document");
    
    const finalPhase = await project.currentPhase();
    console.log(`Final phase: ${finalPhase}`);
    
    // Should have progressed through phases 1-4 (one for each permit type)
    expect(Number(finalPhase)).to.equal(5, 
      "Should have progressed to phase 5 after testing all 4 permit types");
  });
});

describe("Permit Document Verification E2E - Positive Test", function () {
  this.timeout(180000); // 3 minutes
  
  let nodeProc;
  let workerProc;
  let provider;
  let deployer;
  let investor;
  let workerWallet;
  let registry;
  let project;
  let validDocumentHash;
  let validDocumentBuffer;

  before(async () => {
    console.log("\n=== Setting up E2E test for permit verification (POSITIVE) ===");
    console.log("Valid permit document URL:", VALID_PERMIT_URL);
    console.log("Testing DocID: Building Permit (6)");
    
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
    const workerAddress = await workerWallet.getAddress();

    const registryArtifact = loadArtifact("core", "ProjectRegistry");
    const projectArtifact = loadArtifact("core", "CornerstoneProject");
    const mockArtifact = loadArtifact("mocks", "MockPYUSD");

    // Fetch the valid permit document
    console.log("\n=== Fetching valid permit document ===");
    const { buffer, docHash } = await fetchDocument(VALID_PERMIT_URL);
    validDocumentHash = docHash;
    validDocumentBuffer = buffer;
    console.log("Document hash:", docHash);
    console.log("Document size:", buffer.length, "bytes");

    console.log("\n=== Deploying contracts ===");
    const stablecoin = await deployContract(mockArtifact, deployer, []);
    const registryContract = await deployContract(registryArtifact, deployer, []);
    registry = registryContract.connect(deployer);

    // Configure registry verifier to the worker signer
    await (await registry.setVerifier(workerAddress)).wait();
    console.log("Registry verifier set to:", workerAddress);

    // Start worker to catch ProjectCreated event
    workerProc = startEigenWorker(await registry.getAddress());
    await delay(1000);

    // Create project through registry
    console.log("\n=== Creating project ===");
    const minRaise = 1_000_000n;
    const maxRaise = 2_000_000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const aprs = [0, 500, 500, 500, 500, 0];
    const durations = [0, 0, 0, 0, 0, 0];
    const caps = [0, 2000, 2000, 2000, 2000, 1000];
    
    const createTx = await registry.createProjectWithTokenMeta(
      await stablecoin.getAddress(),
      "Cornerstone Permit Verification - Positive",
      "CST-PERMIT-POS",
      minRaise,
      maxRaise,
      deadline,
      aprs,
      durations,
      caps,
      "ipfs://permit-verification-positive"
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

    // Fund project to satisfy minimum raise
    console.log("\n=== Funding project ===");
    const investorAddress = await investor.getAddress();
    await (await stablecoin.mint(investorAddress, minRaise)).wait();
    await (await stablecoin.connect(investor).approve(projectAddress, minRaise)).wait();
    await (await project.connect(investor).deposit(minRaise)).wait();
    console.log("Minimum raise satisfied");

    // Close phase 0 to move to phase 1
    console.log("\n=== Closing phase 0 ===");
    const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
    const closeTx = await project.closePhase(
      0,
      [DocID.TITLE_DOCUMENT, DocID.TITLE_INSURANCE],
      ["pdf", "pdf"],
      [dummyHash, dummyHash],
      ["ipfs://dummy", "ipfs://dummy"]
    );
    await closeTx.wait();
    console.log("Phase 0 closed, now in phase 1");

    console.log("\n=== Setup complete ===\n");
  });

  after(async () => {
    workerProc?.kill("SIGINT");
    if (!process.env.E2E_REUSE_NODE) {
      nodeProc?.kill("SIGINT");
    }
  });

  it("should successfully verify a real Vancouver Building Permit document", async function() {
    this.timeout(120000); // 2 minutes
    
    console.log("\n=== Testing Building Permit (DocID 6) - POSITIVE ===");
    
    // Encode document as data URI
    const base64 = validDocumentBuffer.toString("base64");
    const docUri = `data:application/pdf;base64,${base64}`;
    
    // Get current phase (should be 1)
    const currentPhase = await project.currentPhase();
    console.log(`Current phase: ${currentPhase}`);
    expect(Number(currentPhase)).to.equal(1, "Should be in phase 1");
    
    // Close phase 1 with the building permit document (phase 1 requires DocID 4-7 permits)
    const docId = DocID.BUILDING_PERMIT;
    console.log(`Closing phase ${currentPhase} with Building Permit...`);
    const closeTx = await project.closePhase(
      currentPhase,
      [docId],
      ["pdf"],
      [validDocumentHash],
      [docUri]
    );
    const closeRc = await closeTx.wait();
    console.log(`Phase ${currentPhase} closed with permit verification job`);
    
    // Calculate jobId
    const jobId = ethers.solidityPackedKeccak256(
      ["address", "uint8", "bytes32"],
      [await project.getAddress(), docId, validDocumentHash]
    );
    console.log("Job ID:", jobId);
    console.log("Doc Hash:", validDocumentHash);
    
    console.log("\n=== Waiting for worker to process verification ===");
    
    // Wait for verification to complete (may take longer for API calls)
    const completed = await waitFor(async () => {
      const job = await project.verificationJobs(jobId);
      return job.completed;
    }, 90000, 3000); // 90 seconds timeout
    
    expect(completed).to.equal(true, "verification job did not complete in time");
    
    const job = await project.verificationJobs(jobId);
    
    console.log("\n=== Verification Results ===");
    console.log("Job completed:", job.completed);
    console.log("Verification success:", job.success);
    console.log("Document hash:", job.docHash);
    console.log("DocID:", job.docId);
    console.log("Extracted text:", job.extractedText);
    
    // Assertions - verification should SUCCEED for valid permit
    expect(job.completed).to.equal(true, 
      "Building Permit: verification should be completed");
    
    expect(job.success).to.equal(true, 
      "Building Permit: verification should SUCCEED for valid Vancouver permit document");
    
    expect(job.docHash).to.equal(validDocumentHash, 
      "Building Permit: document hash should match");
    
    expect(Number(job.docId)).to.equal(docId, 
      "Building Permit: docId should match");
    
    // Extracted text should contain permit information
    expect(job.extractedText).to.not.be.empty;
    expect(job.extractedText).to.include("Address:", 
      "Extracted text should contain address information");
    expect(job.extractedText).to.include("Permit:", 
      "Extracted text should contain permit number");
    
    console.log("\n✓ Building Permit successfully verified with Vancouver API");
    console.log("✓ Permit information extracted:", job.extractedText);
    
    // Verify phase progression
    const newPhase = await project.currentPhase();
    console.log(`\nProgressed to phase: ${newPhase}`);
    expect(Number(newPhase)).to.equal(2, "Should have progressed to phase 2");
  });

  it("should verify positive test completed successfully", async () => {
    console.log("\n=== Summary (Positive Test) ===");
    console.log("✓ Real Vancouver Building Permit document verified successfully");
    console.log("✓ Worker correctly queried Vancouver Open Data API");
    console.log("✓ Permit information extracted and validated");
    console.log("✓ Project phase progressed as expected");
  });
});