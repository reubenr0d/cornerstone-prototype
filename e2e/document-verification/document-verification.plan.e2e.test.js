const { expect } = require("chai");
const { ethers } = require("ethers");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");
const DEPLOYMENT_DIR = path.join(__dirname, ".deployments");

// Design Plan document URL
const DESIGN_PLAN_URL = "https://files.catbox.moe/nfbtvt.pdf";

const RPC_URL = process.env.E2E_RPC_URL || "http://127.0.0.1:8546";
const RPC = new URL(RPC_URL);

// Hardhat default funded accounts
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const INVESTOR_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

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

describe("Design Plan Document Test", function () {
  this.timeout(120000); // 2 minutes

  let nodeProc;
  let provider;
  let deployer;
  let investor;
  let registry;
  let project;
  let designPlanHash;
  let designPlanBuffer;

  before(async () => {
    console.log("\n=== Setting up E2E test for Design Plan (DocID 2) ===");
    console.log("Design Plan document URL:", DESIGN_PLAN_URL);
    
    // Compile contracts to pull fresh artifacts
    await runCommand("npm", ["run", "compile"], { cwd: CONTRACTS_DIR });

    const reuseNode = process.env.E2E_REUSE_NODE === "1";
    if (!reuseNode) {
      nodeProc = startHardhatNode();
    }
    provider = await waitForRpc();

    deployer = new ethers.NonceManager(new ethers.Wallet(DEPLOYER_PK, provider));
    investor = new ethers.NonceManager(new ethers.Wallet(INVESTOR_PK, provider));

    const registryArtifact = loadArtifact("core", "ProjectRegistry");
    const projectArtifact = loadArtifact("core", "CornerstoneProject");
    const mockArtifact = loadArtifact("mocks", "MockPYUSD");

    // Fetch the design plan document
    console.log("\n=== Fetching design plan document ===");
    const { buffer, docHash } = await fetchDocument(DESIGN_PLAN_URL);
    designPlanHash = docHash;
    designPlanBuffer = buffer;
    console.log("Document hash:", docHash);
    console.log("Document size:", buffer.length, "bytes");

    console.log("\n=== Deploying contracts ===");
    const stablecoin = await deployContract(mockArtifact, deployer, []);
    const registryContract = await deployContract(registryArtifact, deployer, []);
    registry = registryContract.connect(deployer);
    console.log("Registry deployed at:", await registry.getAddress());

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
      "Cornerstone Design Plan Test",
      "CST-DESIGN",
      minRaise,
      maxRaise,
      deadline,
      aprs,
      durations,
      caps,
      "ipfs://design-plan-test"
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
    if (!process.env.E2E_REUSE_NODE) {
      nodeProc?.kill("SIGINT");
    }
  });

  it("should close phase 1 with Design Plan document (DocID 2)", async function() {
    this.timeout(60000); // 1 minute
    
    console.log("\n=== Testing Design Plan (DocID 2) ===");
    
    // Encode document as data URI
    const base64 = designPlanBuffer.toString("base64");
    const docUri = `data:application/pdf;base64,${base64}`;
    
    // Get current phase (should be 1)
    const currentPhase = await project.currentPhase();
    console.log(`Current phase: ${currentPhase}`);
    expect(Number(currentPhase)).to.equal(1, "Should be in phase 1");
    
    // Close phase 1 with the design plan document
    const docId = DocID.DESIGN_PLAN;
    console.log(`Closing phase ${currentPhase} with Design Plan (DocID ${docId})...`);
    const closeTx = await project.closePhase(
      currentPhase,
      [3],
      ["pdf"],
      [designPlanHash],
      [docUri]
    );
    const closeRc = await closeTx.wait();
    console.log(`Phase ${currentPhase} closed successfully`);
    console.log("Transaction hash:", closeRc.hash);
    
    // Verify phase progression
    const newPhase = await project.currentPhase();
    console.log(`\nProgressed to phase: ${newPhase}`);
    expect(Number(newPhase)).to.equal(2, "Should have progressed to phase 2");
    
    console.log("\n✓ Design Plan document submitted successfully");
    console.log("✓ Phase 1 closed with DocID 2");
    console.log("✓ Document hash:", designPlanHash);
  });
});