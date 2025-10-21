const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployRegistryFixture, defaultPhaseParams } = require("./fixtures");

describe("ProjectRegistry", function () {
  it("deploys and tracks project count", async function () {
    const { registry } = await deployRegistryFixture();
    const count = await registry.projectCount();
    expect(count).to.equal(0n);
  });

  it("createProject auto names and increments count", async function () {
    const { registry, pyusd } = await deployRegistryFixture();
    const { phaseAPRs, phaseDurations, phaseCapsBps } = defaultPhaseParams();
    const now = await time.latest();
    const tx = await registry.createProject(
      await pyusd.getAddress(),
      1000,
      2000,
      now + 7 * 24 * 60 * 60,
      phaseAPRs,
      phaseDurations,
      phaseCapsBps
    );
    const receipt = await tx.wait();
    const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "ProjectCreated");
    expect(ev).to.not.be.undefined;
    const count = await registry.projectCount();
    expect(count).to.equal(1n);

    // Parse addresses from the emitted event
    const tx2 = await registry.createProject(
      await pyusd.getAddress(),
      1000,
      2000,
      now + 8 * 24 * 60 * 60,
      phaseAPRs,
      phaseDurations,
      phaseCapsBps
    );
    const rc2 = await tx2.wait();
    const ev2 = rc2.logs.find((l) => l.fragment && l.fragment.name === "ProjectCreated");
    expect(ev2).to.not.be.undefined;
    const [projectAddr, tokenAddr] = ev2.args;
    expect(projectAddr).to.properAddress;
    expect(tokenAddr).to.properAddress;
  });

  it("createProjectWithTokenMeta uses provided name/symbol", async function () {
    const { registry, pyusd } = await deployRegistryFixture();
    const { phaseAPRs, phaseDurations, phaseCapsBps } = defaultPhaseParams();
    const now = await time.latest();
    const tx = await registry.createProjectWithTokenMeta(
      await pyusd.getAddress(),
      "MyToken",
      "cAGG-X",
      1000,
      2000,
      now + 7 * 24 * 60 * 60,
      phaseAPRs,
      phaseDurations,
      phaseCapsBps
    );
    const receipt = await tx.wait();
    const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "ProjectCreated");
    expect(ev).to.not.be.undefined;
  });

  it("reverts on zero stablecoin address", async function () {
    const { registry } = await deployRegistryFixture();
    const { phaseAPRs, phaseDurations, phaseCapsBps } = defaultPhaseParams();
    const now = await time.latest();
    await expect(
      registry.createProject(
        ethers.ZeroAddress,
        1000,
        2000,
        now + 1000,
        phaseAPRs,
        phaseDurations,
        phaseCapsBps
      )
    ).to.be.revertedWith("stablecoin addr required");
  });

  it("reverts on bad bounds or deadline in past", async function () {
    const { registry, pyusd } = await deployRegistryFixture();
    const { phaseAPRs, phaseDurations, phaseCapsBps } = defaultPhaseParams();
    const stablecoinAddr = await pyusd.getAddress();
    
    await expect(
      registry.createProject(
        stablecoinAddr,
        0,
        0,
        (await time.latest()) + 1000,
        phaseAPRs,
        phaseDurations,
        phaseCapsBps
      )
    ).to.be.revertedWith("bad raise bounds");
    
    await expect(
      registry.createProject(
        stablecoinAddr,
        1000,
        1000,
        (await time.latest()) - 1,
        phaseAPRs,
        phaseDurations,
        phaseCapsBps
      )
    ).to.be.revertedWith("deadline in past");
  });
});
