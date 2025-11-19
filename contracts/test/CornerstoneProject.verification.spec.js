const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Verification Hooks", function () {
  async function setupClosedPhase0() {
    const { dev, user1, other, project, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    return { dev, user1, other, project, params };
  }

  it("emits VerificationRequested and stores job on closePhase", async function () {
    const { dev, project } = await setupClosedPhase0();
    const docHash = ethers.keccak256(ethers.toUtf8Bytes("doc1"));
    const phaseId = 0;
    const docIndex = 0;
    const jobId = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint8", "uint256", "bytes32"],
        [await project.getAddress(), phaseId, docIndex, docHash]
      )
    );

    await expect(
      project.connect(dev).closePhase(phaseId, ["application/pdf"], [docHash], ["ipfs://doc1"])
    )
      .to.emit(project, "VerificationRequested")
      .withArgs(jobId, await project.getAddress(), phaseId, docIndex, "ipfs://doc1", docHash);

    const job = await project.verificationJobs(jobId);
    expect(job.docHash).to.equal(docHash);
    expect(job.phaseId).to.equal(phaseId);
    expect(job.docIndex).to.equal(docIndex);
    expect(job.completed).to.equal(false);
  });

  it("only verifier can setVerificationResult and enforces hash + single completion", async function () {
    const { dev, other, project } = await setupClosedPhase0();
    const docHash = ethers.keccak256(ethers.toUtf8Bytes("doc1"));
    const phaseId = 0;
    await project.connect(dev).closePhase(phaseId, ["application/pdf"], [docHash], ["ipfs://doc1"]);
    const jobId = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint8", "uint256", "bytes32"],
        [await project.getAddress(), phaseId, 0, docHash]
      )
    );

    await expect(
      project.connect(other).setVerificationResult(jobId, docHash, true)
    ).to.be.revertedWith("verifier only");

    await expect(
      project.connect(dev).setVerificationResult(jobId, ethers.ZeroHash, true)
    ).to.be.revertedWith("hash mismatch");

    await expect(project.connect(dev).setVerificationResult(jobId, docHash, true))
      .to.emit(project, "VerificationResult")
      .withArgs(jobId, await project.getAddress(), phaseId, 0, docHash, true);

    const job = await project.verificationJobs(jobId);
    expect(job.completed).to.equal(true);
    expect(job.success).to.equal(true);

    await expect(
      project.connect(dev).setVerificationResult(jobId, docHash, true)
    ).to.be.revertedWith("already completed");
  });

  it("allows updating verifier by dev", async function () {
    const { dev, other, project } = await setupClosedPhase0();
    await expect(project.connect(other).setVerifier(other.address)).to.be.revertedWith("dev only");
    await project.connect(dev).setVerifier(other.address);
    expect(await project.verifier()).to.equal(other.address);
  });
});
