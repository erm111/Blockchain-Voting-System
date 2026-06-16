const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_DAY = 24 * 60 * 60;
const hashMatric = (m) => ethers.keccak256(ethers.toUtf8Bytes(m));

describe("BVS - Babcock Voting System", function () {
  let bvs, owner, official, relayer, outsider;

  beforeEach(async function () {
    [owner, official, relayer, outsider] = await ethers.getSigners();
    const BVS = await ethers.getContractFactory("BVS");
    bvs = await BVS.deploy();
    await bvs.waitForDeployment();
    await bvs.addOfficial(official.address);
    await bvs.setRelayer(relayer.address);
  });

  async function setupElection() {
    // President (pos 1): Ada(1), Bola(2). VP (pos 2): Chidi(1), Dare(2).
    await bvs.connect(official).createElection("SUG 2026");
    await bvs.connect(official).addPosition(1, "President");
    await bvs.connect(official).addPosition(1, "Vice President");
    await bvs.connect(official).addCandidate(1, 1, "Ada");
    await bvs.connect(official).addCandidate(1, 1, "Bola");
    await bvs.connect(official).addCandidate(1, 2, "Chidi");
    await bvs.connect(official).addCandidate(1, 2, "Dare");
  }

  it("only officials can create/configure elections", async function () {
    await expect(bvs.connect(outsider).createElection("X")).to.be.revertedWith("BVS: not official");
  });

  it("locks configuration once started", async function () {
    await setupElection();
    await bvs.connect(official).startElection(1, ONE_DAY);
    await expect(bvs.connect(official).addCandidate(1, 1, "Late")).to.be.revertedWith("BVS: election locked");
  });

  it("requires positions before starting", async function () {
    await bvs.connect(official).createElection("Empty");
    await expect(bvs.connect(official).startElection(1, ONE_DAY)).to.be.revertedWith("BVS: no positions");
  });

  it("rejects votes from non-approved voters", async function () {
    await setupElection();
    await bvs.connect(official).startElection(1, ONE_DAY);
    const m = hashMatric("19/0001");
    await expect(bvs.connect(relayer).castVote(1, 1, 1, m)).to.be.revertedWith("BVS: voter not approved");
  });

  it("allows an approved voter exactly one vote per position", async function () {
    await setupElection();
    await bvs.connect(official).startElection(1, ONE_DAY);
    const m = hashMatric("19/0001");
    await bvs.connect(official).approveVoter(1, m);

    // Vote President -> Ada
    await bvs.connect(relayer).castVote(1, 1, 1, m);
    // Second vote for President must fail (already voted that position)
    await expect(bvs.connect(relayer).castVote(1, 1, 2, m)).to.be.revertedWith("BVS: already voted for position");

    // But the SAME voter can still vote for VP
    await bvs.connect(relayer).castVote(1, 2, 1, m);
    await expect(bvs.connect(relayer).castVote(1, 2, 2, m)).to.be.revertedWith("BVS: already voted for position");

    const ada = await bvs.getCandidate(1, 1, 1);
    const chidi = await bvs.getCandidate(1, 2, 1);
    expect(ada.voteCount).to.equal(1n);
    expect(chidi.voteCount).to.equal(1n);
  });

  it("can deactivate (revoke) an approved voter, blocking further votes", async function () {
    await setupElection();
    await bvs.connect(official).startElection(1, ONE_DAY);
    const m = hashMatric("19/0001");
    await bvs.connect(official).approveVoter(1, m);
    expect(await bvs.isApproved(1, m)).to.equal(true);

    // Vote President, then get deactivated
    await bvs.connect(relayer).castVote(1, 1, 1, m);
    await bvs.connect(official).revokeVoter(1, m);
    expect(await bvs.isApproved(1, m)).to.equal(false);

    // Cannot vote remaining positions once deactivated
    await expect(bvs.connect(relayer).castVote(1, 2, 1, m)).to.be.revertedWith("BVS: voter not approved");
    // ...but the already-cast President vote stands
    const ada = await bvs.getCandidate(1, 1, 1);
    expect(ada.voteCount).to.equal(1n);

    // Re-activating lets them vote again
    await bvs.connect(official).approveVoter(1, m);
    await bvs.connect(relayer).castVote(1, 2, 1, m);
    const chidi = await bvs.getCandidate(1, 2, 1);
    expect(chidi.voteCount).to.equal(1n);
  });

  it("casts a full ballot in one tx via castVotes, skipping duplicates", async function () {
    await setupElection();
    await bvs.connect(official).startElection(1, ONE_DAY);
    const m = hashMatric("19/0001");
    await bvs.connect(official).approveVoter(1, m);

    // One tx: President->Ada(1,1), VP->Dare(2,2)
    await bvs.connect(relayer).castVotes(1, [1, 2], [1, 2], m);
    expect((await bvs.getCandidate(1, 1, 1)).voteCount).to.equal(1n);
    expect((await bvs.getCandidate(1, 2, 2)).voteCount).to.equal(1n);
    // The voter's actual choices are recorded and retrievable
    expect(await bvs.votedCandidate(1, 1, m)).to.equal(1n);
    expect(await bvs.votedCandidate(1, 2, m)).to.equal(2n);

    // Re-submitting the whole ballot must not double-count (positions skipped)
    await bvs.connect(relayer).castVotes(1, [1, 2], [2, 1], m);
    expect((await bvs.getCandidate(1, 1, 1)).voteCount).to.equal(1n);
    expect((await bvs.getCandidate(1, 1, 2)).voteCount).to.equal(0n);
    expect((await bvs.getCandidate(1, 2, 2)).voteCount).to.equal(1n);
  });

  it("getResults returns all positions, candidates and tallies in one call", async function () {
    await setupElection();
    await bvs.connect(official).startElection(1, ONE_DAY);
    const m = hashMatric("19/0001");
    await bvs.connect(official).approveVoter(1, m);
    await bvs.connect(relayer).castVotes(1, [1], [2], m); // President -> Bola

    const res = await bvs.getResults(1);
    expect(res.length).to.equal(2);
    expect(res[0].name).to.equal("President");
    expect(res[0].candidates.length).to.equal(2);
    expect(res[0].candidates[1].name).to.equal("Bola");
    expect(res[0].candidates[1].voteCount).to.equal(1n);
  });

  it("blocks non-relayer/official from casting votes", async function () {
    await setupElection();
    await bvs.connect(official).startElection(1, ONE_DAY);
    const m = hashMatric("19/0001");
    await bvs.connect(official).approveVoter(1, m);
    await expect(bvs.connect(outsider).castVote(1, 1, 1, m)).to.be.revertedWith("BVS: not relayer/official");
  });

  it("stops manually and finalizes results, rejecting further votes", async function () {
    await setupElection();
    await bvs.connect(official).startElection(1, ONE_DAY);
    const a = hashMatric("19/0001");
    const b = hashMatric("19/0002");
    await bvs.connect(official).approveVoter(1, a);
    await bvs.connect(official).approveVoter(1, b);
    await bvs.connect(relayer).castVote(1, 1, 1, a); // Ada
    await bvs.connect(relayer).castVote(1, 1, 1, b); // Ada

    await bvs.connect(official).stopElection(1);
    const e = await bvs.getElection(1);
    expect(e.status).to.equal(2); // Ended

    await expect(bvs.connect(relayer).castVote(1, 2, 1, a)).to.be.revertedWith("BVS: not active");

    const ada = await bvs.getCandidate(1, 1, 1);
    expect(ada.voteCount).to.equal(2n);
  });

  it("auto-expires after the duration and rejects late votes", async function () {
    await setupElection();
    await bvs.connect(official).startElection(1, ONE_DAY);
    const m = hashMatric("19/0001");
    await bvs.connect(official).approveVoter(1, m);

    await time.increase(ONE_DAY + 1);
    await expect(bvs.connect(relayer).castVote(1, 1, 1, m)).to.be.revertedWith("BVS: voting closed");

    // anyone may finalize an expired election
    await bvs.connect(outsider).stopElection(1);
    const e = await bvs.getElection(1);
    expect(e.status).to.equal(2);
  });

  it("cannot approve voters after the election ended", async function () {
    await setupElection();
    await bvs.connect(official).startElection(1, ONE_DAY);
    await bvs.connect(official).stopElection(1);
    await expect(bvs.connect(official).approveVoter(1, hashMatric("19/0009"))).to.be.revertedWith("BVS: election ended");
  });
});
