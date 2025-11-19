const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Verification Hooks", function () {
  async function setupClosedPhase0() {
    const { dev, user1, other, project, mintAndApprove, params } =
      await deployProjectFixture();

    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);

    return { dev, user1, other, project, params };
  }

  it("emits VerificationRequested and stores job on closePhase", async function () {
    const { dev, project } = await setupClosedPhase0();

    const docHash = ethers.keccak256(ethers.toUtf8Bytes("doc1"));
    const docId = 0; // DocID.TITLE_DOCUMENT
    const phaseId = 0;
    const docUri = "ipfs://doc1";

    // Contract calculates jobId as: keccak256(abi.encodePacked(address(this), docId, docHash))
    const jobId = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint8", "bytes32"],
        [await project.getAddress(), docId, docHash]
      )
    );

    // Event signature: VerificationRequested(bytes32 indexed jobId, address indexed project, DocID docId, string docUri, bytes32 docHash)
    await expect(
      project
        .connect(dev)
        .closePhase(
          phaseId,
          [docId],
          ["application/pdf"],
          [docHash],
          [docUri]
        )
    )
      .to.emit(project, "VerificationRequested")
      .withArgs(
        jobId,
        await project.getAddress(),
        docId,
        docUri,
        docHash
      );

    // Check the stored job - struct has: docHash, docId, completed, success, extractedText
    const job = await project.verificationJobs(jobId);
    expect(job.docHash).to.equal(docHash);
    expect(job.docId).to.equal(docId);
    expect(job.completed).to.equal(false);
    expect(job.success).to.equal(false);
    expect(job.extractedText).to.equal("");
  });

  it("only verifier can setVerificationResult and enforces hash + single completion", async function () {
    const { dev, other, project } = await setupClosedPhase0();

    const docHash = ethers.keccak256(ethers.toUtf8Bytes("doc1"));
    const docId = 0; // DocID.TITLE_DOCUMENT
    const phaseId = 0;

    await project
      .connect(dev)
      .closePhase(
        phaseId,
        [docId],
        ["application/pdf"],
        [docHash],
        ["ipfs://doc1"]
      );

    // Contract calculates jobId as: keccak256(abi.encodePacked(address(this), docId, docHash))
    const jobId = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint8", "bytes32"],
        [await project.getAddress(), docId, docHash]
      )
    );

    // Reverted call: verifier only
    await expect(
      project.connect(other).setVerificationResult(jobId, docHash, true, "extracted text")
    ).to.be.revertedWith("verifier only");

    // Reverted call: hash mismatch
    await expect(
      project.connect(dev).setVerificationResult(jobId, ethers.ZeroHash, true, "extracted text")
    ).to.be.revertedWith("hash mismatch");

    // Successful call - function signature: setVerificationResult(bytes32 jobId, bytes32 docHash, bool success, string calldata extractedText)
    const extractedText = "Document verification successful";
    await expect(
      project.connect(dev).setVerificationResult(jobId, docHash, true, extractedText)
    )
      .to.emit(project, "VerificationResult")
      .withArgs(
        jobId,
        await project.getAddress(),
        docId,
        docHash,
        true
      );

    const job = await project.verificationJobs(jobId);
    expect(job.completed).to.equal(true);
    expect(job.success).to.equal(true);
    expect(job.extractedText).to.equal(extractedText);

    // Reverted call: already completed
    await expect(
      project.connect(dev).setVerificationResult(jobId, docHash, true, "another attempt")
    ).to.be.revertedWith("already completed");
  });

  it("allows updating verifier by dev", async function () {
    const { dev, other, project } = await setupClosedPhase0();

    await expect(
      project.connect(other).setVerifier(other.address)
    ).to.be.revertedWith("dev only");

    await project.connect(dev).setVerifier(other.address);
    expect(await project.verifier()).to.equal(other.address);
  });
});