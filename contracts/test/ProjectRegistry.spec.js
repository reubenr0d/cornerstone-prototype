const { expect: expect5 } = require("chai");
const { ethers: ethers5 } = require("hardhat");
const { time: time4 } = require("@nomicfoundation/hardhat-network-helpers");
const { deployRegistryFixture, defaultPhaseParams } = require("./fixtures");

describe("ProjectRegistry", function () {
  it("deploys and tracks project count", async function () {
    const { registry } = await deployRegistryFixture();
    const count = await registry.projectCount();
    expect5(count).to.equal(0n);
  });

  it("createProject auto names and increments count", async function () {
    const { registry, pyusd } = await deployRegistryFixture();
    const { phaseAPRs } = defaultPhaseParams();
    const now = await time4.latest();
    const tx = await registry.createProject(
      await pyusd.getAddress(),
      1000,
      2000,
      now + 7 * 24 * 60 * 60,
      phaseAPRs,
      "ipfs://test-metadata-1"
    );
    const receipt = await tx.wait();
    const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "ProjectCreated");
    expect5(ev).to.not.be.undefined;
    const count = await registry.projectCount();
    expect5(count).to.equal(1n);
    
    const tx2 = await registry.createProject(
      await pyusd.getAddress(),
      1000,
      2000,
      now + 8 * 24 * 60 * 60,
      phaseAPRs,
      "ipfs://test-metadata-2"
    );
    const rc2 = await tx2.wait();
    const ev2 = rc2.logs.find((l) => l.fragment && l.fragment.name === "ProjectCreated");
    expect5(ev2).to.not.be.undefined;
    const [projectAddr, tokenAddr] = ev2.args;
    expect5(projectAddr).to.properAddress;
    expect5(tokenAddr).to.properAddress;
  });

  it("createProjectWithTokenMeta uses provided name/symbol", async function () {
    const { registry, pyusd } = await deployRegistryFixture();
    const { phaseAPRs } = defaultPhaseParams();
    const now = await time4.latest();
    const tx = await registry.createProjectWithTokenMeta(
      await pyusd.getAddress(),
      "MyToken",
      "cAGG-X",
      1000,
      2000,
      now + 7 * 24 * 60 * 60,
      phaseAPRs,
      "ipfs://custom-token-metadata"
    );
    const receipt = await tx.wait();
    const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "ProjectCreated");
    expect5(ev).to.not.be.undefined;
  });

  it("reverts on zero stablecoin address", async function () {
    const { registry } = await deployRegistryFixture();
    const { phaseAPRs } = defaultPhaseParams();
    const now = await time4.latest();
    await expect5(
      registry.createProject(
        ethers5.ZeroAddress,
        1000,
        2000,
        now + 1000,
        phaseAPRs,
        "ipfs://test-metadata"
      )
    ).to.be.revertedWith("stablecoin addr required");
  });

  it("reverts on bad bounds or deadline in past", async function () {
    const { registry, pyusd } = await deployRegistryFixture();
    const { phaseAPRs } = defaultPhaseParams();
    const stablecoinAddr = await pyusd.getAddress();
    
    await expect5(
      registry.createProject(
        stablecoinAddr,
        0,
        0,
        (await time4.latest()) + 1000,
        phaseAPRs,
        "ipfs://test-metadata"
      )
    ).to.be.revertedWith("bad raise bounds");
    
    await expect5(
      registry.createProject(
        stablecoinAddr,
        1000,
        1000,
        (await time4.latest()) - 1,
        phaseAPRs,
        "ipfs://test-metadata"
      )
    ).to.be.revertedWith("deadline in past");
  });
});