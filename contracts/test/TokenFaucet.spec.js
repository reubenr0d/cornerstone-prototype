const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const CLAIM_AMOUNT = 10_000n * 1_000_000n;

describe("TokenFaucet", function () {
  async function deployFixture() {
    const [owner, user] = await ethers.getSigners();
    const MockPYUSD = await ethers.getContractFactory("MockPYUSD", owner);
    const token = await MockPYUSD.deploy();
    await token.waitForDeployment();

    const Faucet = await ethers.getContractFactory("TokenFaucet", owner);
    const faucet = await Faucet.deploy(await token.getAddress());
    await faucet.waitForDeployment();

    // Seed faucet with large balance
    const faucetAddress = await faucet.getAddress();
    await token.mint(faucetAddress, 1_000_000_000n * 1_000_000n);

    return { owner, user, token, faucet, faucetAddress };
  }

  it("dispenses claim amount once per day", async function () {
    const { user, token, faucet } = await deployFixture();

    await faucet.connect(user).claim();
    expect(await token.balanceOf(user.address)).to.equal(CLAIM_AMOUNT);

    await expect(faucet.connect(user).claim()).to.be.revertedWith(
      "Faucet: claim too soon"
    );

    await time.increase(24 * 60 * 60);

    await faucet.connect(user).claim();
    expect(await token.balanceOf(user.address)).to.equal(CLAIM_AMOUNT * 2n);
  });

  it("allows owner to withdraw excess funds", async function () {
    const { owner, token, faucet, faucetAddress } = await deployFixture();
    const withdrawAmount = 100_000n * 1_000_000n;

    await faucet.withdraw(owner.address, withdrawAmount);
    expect(await token.balanceOf(owner.address)).to.equal(withdrawAmount);
    expect(await token.balanceOf(faucetAddress)).to.equal(
      1_000_000_000n * 1_000_000n - withdrawAmount
    );
  });
});
