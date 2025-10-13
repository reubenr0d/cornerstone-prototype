const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CornerstoneToken", function () {
  it("constructor requires project address", async function () {
    const Token = await ethers.getContractFactory("CornerstoneToken");
    await expect(Token.deploy("Name", "SYM", ethers.ZeroAddress)).to.be.revertedWith(
      "project required"
    );
  });

  it("decimals is 6", async function () {
    const [owner] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("CornerstoneToken", owner);
    const tok = await Token.deploy("Name", "SYM", owner.address);
    await tok.waitForDeployment();
    expect(await tok.decimals()).to.equal(6);
  });

  it("only project can mint/burn; transfers work", async function () {
    const [deployer, user] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("CornerstoneToken", deployer);
    const Hook = await ethers.getContractFactory("TransferHookMock", deployer);
    const hook = await Hook.deploy();
    await hook.waitForDeployment();

    const tok = await Token.deploy("Name", "SYM", await hook.getAddress());
    await tok.waitForDeployment();

    await expect(tok.connect(user).mint(user.address, 1000)).to.be.revertedWith("only project");
    await hook.mintTo(await tok.getAddress(), user.address, 1000);
    expect(await tok.balanceOf(user.address)).to.equal(1000n);

    await expect(tok.connect(user).burn(user.address, 500)).to.be.revertedWith("only project");
    await hook.burnFrom(await tok.getAddress(), user.address, 500);
    expect(await tok.balanceOf(user.address)).to.equal(500n);

    await tok.connect(user).transfer(deployer.address, 200);
    expect(await tok.balanceOf(deployer.address)).to.equal(200n);
  });
});
