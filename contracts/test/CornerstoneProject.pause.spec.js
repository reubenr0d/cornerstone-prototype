const { expect } = require("chai");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Pause", function () {
  it("only dev can pause/unpause; paused blocks state-changers", async function () {
    const { dev, user1, project, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);

    await expect(project.connect(user1).pause()).to.be.revertedWith("dev only");
    await project.connect(dev).pause();
    await expect(project.connect(user1).deposit(1)).to.be.revertedWithCustomError(
      project,
      "EnforcedPause"
    );

    await project.connect(dev).unpause();
    await project.connect(user1).deposit(10);
  });
});
