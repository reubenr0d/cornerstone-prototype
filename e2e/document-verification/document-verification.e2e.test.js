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
const SAMPLE_PDF_PATH = path.join(__dirname, "fixtures", "sample.pdf");
const RPC_URL = process.env.E2E_RPC_URL || "http://127.0.0.1:8546";
const RPC = new URL(RPC_URL);

// Hardhat default funded accounts (first two)
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const INVESTOR_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const WORKER_PK = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

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
      LOG_LEVEL: "info",
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
  await delay(1000); // allow provider nonce/cache to refresh between sequential deployments
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

describe("Document verification E2E", function () {
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
      const stablecoin = await deployContract(mockArtifact, deployer, []);
      const registryContract = await deployContract(registryArtifact, deployer, []);
      registry = registryContract.connect(deployer);

      // Configure registry verifier to the worker signer before project creation
      await (await registry.setVerifier(workerAddress)).wait();

      // Start worker early to catch the upcoming ProjectCreated event live
      workerProc = startEigenWorker(await registry.getAddress());
      await delay(500);

      // Create project through registry (uses registry verifier)
      const minRaise = 1_000_000n; // 1 token with 6 decimals
      const maxRaise = 2_000_000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const aprs = [0, 500, 500, 500, 500, 0];
      const durations = [0, 0, 0, 0, 0, 0];
      const caps = [0, 2000, 2000, 2000, 2000, 1000];
      const createTx = await registry.createProjectWithTokenMeta(
        await stablecoin.getAddress(),
        "Cornerstone Demo",
        "CST-DEMO",
        minRaise,
        maxRaise,
        deadline,
        aprs,
        durations,
        caps,
        "ipfs://demo-project"
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

      // Mint and deposit enough stablecoin to satisfy minimum raise
      await (await stablecoin.mint(investorAddress, minRaise)).wait();
      await (await stablecoin.connect(investor).approve(projectAddress, minRaise)).wait();
      await (await project.connect(investor).deposit(minRaise)).wait();

      // Close fundraising phase with the fixture document to create a verification job
      const buffer = fs.readFileSync(SAMPLE_PDF_PATH);
      const base64 = buffer.toString("base64");
      const docHash = ethers.keccak256(buffer);
      const docUri = `data:application/pdf;base64,${base64}`;
      const phaseId = 0;
      const closeTx = await project.closePhase(phaseId, ["pdf"], [docHash], [docUri]);
      await closeTx.wait();
      const jobId = ethers.solidityPackedKeccak256(
        ["address", "uint8", "uint256", "bytes32"],
        [await project.getAddress(), phaseId, 0, docHash]
      );

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
      registry = new ethers.Contract(deployment.registry, registryArtifact.abi, deployer);
      project = new ethers.Contract(deployment.project, projectArtifact.abi, deployer);
      workerProc = startEigenWorker(deployment.registry);
    }

    if (!workerProc) {
      workerProc = startEigenWorker(await registry.getAddress());
    }
  });

  after(async () => {
    workerProc?.kill("SIGINT");
    nodeProc?.kill("SIGINT");
  });

  it("deploys, closes phase 0, and receives Eigen verification callback", async () => {
    const { jobId, docHash } = deployment;

    // Wait for the Eigen worker to process verification
    const completed = await waitFor(async () => {
      const job = await project.verificationJobs(jobId);
      return job.completed;
    }, 60000, 2500);

    expect(completed).to.equal(true, "verification job did not complete in time");
    const job = await project.verificationJobs(jobId);
    expect(job.success).to.equal(true, "verification reported failure");
    expect(job.docHash).to.equal(docHash);
  });
});
