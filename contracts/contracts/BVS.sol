// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BVS - Babcock Voting System
 * @notice On-chain elections for Babcock University student officials.
 *
 * Design notes:
 *  - Voters are identified on-chain by a hash of their matric number
 *    (keccak256 of the normalized "00/0000" string). The matric number
 *    itself is never stored on-chain, only its hash.
 *  - Students do not need a wallet. A trusted backend "relayer" submits
 *    their vote after authenticating them by matric number. Double-voting
 *    is still prevented ON-CHAIN per (election, position, voter), so the
 *    relayer cannot stuff votes for an already-voted position.
 *  - Election officials are addresses granted the official role; they use
 *    their own wallet (e.g. MetaMask) to create/configure/start/stop
 *    elections and to approve voters.
 */
contract BVS {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum Status {
        Created, // being configured
        Active, // voting is open
        Ended // closed, results final
    }

    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    struct Position {
        uint256 id;
        string name;
        uint256 candidateCount;
    }

    struct Election {
        uint256 id;
        string name;
        Status status;
        uint256 startTime; // unix seconds, 0 until started
        uint256 endTime; // unix seconds, scheduled stop (duration)
        uint256 positionCount;
        bool exists;
    }

    // Read-only aggregation types (returned by getResults in a single call).
    struct CandidateResult {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    struct PositionResult {
        uint256 id;
        string name;
        CandidateResult[] candidates;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    address public owner;
    address public relayer; // primary relayer (recorded for clients)
    mapping(address => bool) public relayers; // pool of accounts allowed to relay votes
    mapping(address => bool) public officials;

    uint256 public electionCount;
    mapping(uint256 => Election) private elections;

    // electionId => positionId => Position
    mapping(uint256 => mapping(uint256 => Position)) private positions;
    // electionId => positionId => candidateId => Candidate
    mapping(uint256 => mapping(uint256 => mapping(uint256 => Candidate))) private candidates;

    // electionId => matricHash => approved to vote
    mapping(uint256 => mapping(bytes32 => bool)) public approved;
    // electionId => positionId => matricHash => already voted
    mapping(uint256 => mapping(uint256 => mapping(bytes32 => bool))) public votedFor;
    // electionId => positionId => matricHash => candidateId chosen (0 = none)
    mapping(uint256 => mapping(uint256 => mapping(bytes32 => uint256))) public votedCandidate;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event OfficialAdded(address indexed official);
    event OfficialRemoved(address indexed official);
    event RelayerChanged(address indexed relayer);
    event ElectionCreated(uint256 indexed electionId, string name);
    event PositionAdded(uint256 indexed electionId, uint256 indexed positionId, string name);
    event CandidateAdded(uint256 indexed electionId, uint256 indexed positionId, uint256 indexed candidateId, string name);
    event ElectionStarted(uint256 indexed electionId, uint256 startTime, uint256 endTime);
    event ElectionEnded(uint256 indexed electionId, uint256 endTime);
    event VoterApproved(uint256 indexed electionId, bytes32 indexed matricHash);
    event VoterRevoked(uint256 indexed electionId, bytes32 indexed matricHash);
    event VoteCast(uint256 indexed electionId, uint256 indexed positionId, uint256 indexed candidateId, bytes32 matricHash);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "BVS: not owner");
        _;
    }

    modifier onlyOfficial() {
        require(officials[msg.sender], "BVS: not official");
        _;
    }

    modifier electionExists(uint256 electionId) {
        require(elections[electionId].exists, "BVS: no such election");
        _;
    }

    // ---------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------

    constructor() {
        owner = msg.sender;
        officials[msg.sender] = true; // deployer is the first official
        relayer = msg.sender; // until a dedicated relayer is set
        relayers[msg.sender] = true;
        emit OfficialAdded(msg.sender);
    }

    function addOfficial(address account) external onlyOwner {
        require(account != address(0), "BVS: zero address");
        officials[account] = true;
        emit OfficialAdded(account);
    }

    function removeOfficial(address account) external onlyOwner {
        require(account != owner, "BVS: cannot remove owner");
        officials[account] = false;
        emit OfficialRemoved(account);
    }

    function setRelayer(address account) external onlyOwner {
        require(account != address(0), "BVS: zero address");
        relayer = account;
        relayers[account] = true;
        emit RelayerChanged(account);
    }

    /// @notice Authorize an additional relayer account (enables a relayer pool
    ///         for parallel vote submission under high load).
    function addRelayer(address account) external onlyOwner {
        require(account != address(0), "BVS: zero address");
        relayers[account] = true;
        emit RelayerChanged(account);
    }

    function removeRelayer(address account) external onlyOwner {
        relayers[account] = false;
    }

    function isOfficial(address account) external view returns (bool) {
        return officials[account];
    }

    // ---------------------------------------------------------------------
    // Election configuration (Status.Created only)
    // ---------------------------------------------------------------------

    function createElection(string calldata name) external onlyOfficial returns (uint256) {
        electionCount += 1;
        uint256 id = electionCount;
        Election storage e = elections[id];
        e.id = id;
        e.name = name;
        e.status = Status.Created;
        e.exists = true;
        emit ElectionCreated(id, name);
        return id;
    }

    function addPosition(uint256 electionId, string calldata name)
        external
        onlyOfficial
        electionExists(electionId)
        returns (uint256)
    {
        Election storage e = elections[electionId];
        require(e.status == Status.Created, "BVS: election locked");
        e.positionCount += 1;
        uint256 pid = e.positionCount;
        positions[electionId][pid] = Position({id: pid, name: name, candidateCount: 0});
        emit PositionAdded(electionId, pid, name);
        return pid;
    }

    function addCandidate(uint256 electionId, uint256 positionId, string calldata name)
        external
        onlyOfficial
        electionExists(electionId)
        returns (uint256)
    {
        Election storage e = elections[electionId];
        require(e.status == Status.Created, "BVS: election locked");
        Position storage p = positions[electionId][positionId];
        require(p.id != 0, "BVS: no such position");
        p.candidateCount += 1;
        uint256 cid = p.candidateCount;
        candidates[electionId][positionId][cid] = Candidate({id: cid, name: name, voteCount: 0});
        emit CandidateAdded(electionId, positionId, cid, name);
        return cid;
    }

    // ---------------------------------------------------------------------
    // Lifecycle: start / stop
    // ---------------------------------------------------------------------

    /// @param durationSeconds how long voting stays open (e.g. 1 day = 86400)
    function startElection(uint256 electionId, uint256 durationSeconds)
        external
        onlyOfficial
        electionExists(electionId)
    {
        Election storage e = elections[electionId];
        require(e.status == Status.Created, "BVS: cannot start");
        require(e.positionCount > 0, "BVS: no positions");
        require(durationSeconds > 0, "BVS: bad duration");
        e.status = Status.Active;
        e.startTime = block.timestamp;
        e.endTime = block.timestamp + durationSeconds;
        emit ElectionStarted(electionId, e.startTime, e.endTime);
    }

    /// @notice Officials can manually stop early; anyone can finalize after endTime.
    function stopElection(uint256 electionId) external electionExists(electionId) {
        Election storage e = elections[electionId];
        require(e.status == Status.Active, "BVS: not active");
        bool expired = block.timestamp >= e.endTime;
        require(officials[msg.sender] || expired, "BVS: not authorized to stop");
        e.status = Status.Ended;
        e.endTime = block.timestamp;
        emit ElectionEnded(electionId, e.endTime);
    }

    // ---------------------------------------------------------------------
    // Voter approval
    // ---------------------------------------------------------------------

    function approveVoter(uint256 electionId, bytes32 matricHash)
        external
        onlyOfficial
        electionExists(electionId)
    {
        require(elections[electionId].status != Status.Ended, "BVS: election ended");
        approved[electionId][matricHash] = true;
        emit VoterApproved(electionId, matricHash);
    }

    /// @notice Deactivate a previously-approved voter (e.g. flagged as ineligible).
    /// @dev Already-cast votes are final and are NOT removed; this only blocks
    ///      any future voting by this matric in this election.
    function revokeVoter(uint256 electionId, bytes32 matricHash)
        external
        onlyOfficial
        electionExists(electionId)
    {
        require(elections[electionId].status != Status.Ended, "BVS: election ended");
        approved[electionId][matricHash] = false;
        emit VoterRevoked(electionId, matricHash);
    }

    function approveVoters(uint256 electionId, bytes32[] calldata matricHashes)
        external
        onlyOfficial
        electionExists(electionId)
    {
        require(elections[electionId].status != Status.Ended, "BVS: election ended");
        for (uint256 i = 0; i < matricHashes.length; i++) {
            approved[electionId][matricHashes[i]] = true;
            emit VoterApproved(electionId, matricHashes[i]);
        }
    }

    // ---------------------------------------------------------------------
    // Voting
    // ---------------------------------------------------------------------

    /**
     * @notice Cast a single vote for one candidate in one position.
     * @dev Callable by the relayer (on behalf of an authenticated student)
     *      or directly by an official. One vote per (election, position, voter)
     *      is enforced here regardless of who submits.
     */
    function castVote(uint256 electionId, uint256 positionId, uint256 candidateId, bytes32 matricHash)
        external
        electionExists(electionId)
    {
        require(relayers[msg.sender] || officials[msg.sender], "BVS: not relayer/official");

        Election storage e = elections[electionId];
        require(e.status == Status.Active, "BVS: not active");
        require(block.timestamp < e.endTime, "BVS: voting closed");

        require(approved[electionId][matricHash], "BVS: voter not approved");
        require(!votedFor[electionId][positionId][matricHash], "BVS: already voted for position");

        Position storage p = positions[electionId][positionId];
        require(p.id != 0, "BVS: no such position");
        Candidate storage c = candidates[electionId][positionId][candidateId];
        require(c.id != 0, "BVS: no such candidate");

        votedFor[electionId][positionId][matricHash] = true;
        votedCandidate[electionId][positionId][matricHash] = candidateId;
        c.voteCount += 1;
        emit VoteCast(electionId, positionId, candidateId, matricHash);
    }

    /**
     * @notice Cast a voter's choices for several positions in ONE transaction.
     * @dev This is the high-throughput path: one tx per voter instead of one
     *      per position. Positions already voted, or invalid position/candidate
     *      ids, are skipped (no revert) so a single duplicate can't fail the
     *      whole ballot. positionIds[i] pairs with candidateIds[i].
     */
    function castVotes(
        uint256 electionId,
        uint256[] calldata positionIds,
        uint256[] calldata candidateIds,
        bytes32 matricHash
    ) external electionExists(electionId) {
        require(relayers[msg.sender] || officials[msg.sender], "BVS: not relayer/official");
        require(positionIds.length == candidateIds.length, "BVS: length mismatch");

        Election storage e = elections[electionId];
        require(e.status == Status.Active, "BVS: not active");
        require(block.timestamp < e.endTime, "BVS: voting closed");
        require(approved[electionId][matricHash], "BVS: voter not approved");

        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 pid = positionIds[i];
            uint256 cid = candidateIds[i];
            if (votedFor[electionId][pid][matricHash]) continue; // one vote per position
            Position storage p = positions[electionId][pid];
            if (p.id == 0) continue;
            Candidate storage c = candidates[electionId][pid][cid];
            if (c.id == 0) continue;

            votedFor[electionId][pid][matricHash] = true;
            votedCandidate[electionId][pid][matricHash] = cid;
            c.voteCount += 1;
            emit VoteCast(electionId, pid, cid, matricHash);
        }
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getElection(uint256 electionId)
        external
        view
        electionExists(electionId)
        returns (
            uint256 id,
            string memory name,
            Status status,
            uint256 startTime,
            uint256 endTime,
            uint256 positionCount,
            bool timeExpired
        )
    {
        Election storage e = elections[electionId];
        return (
            e.id,
            e.name,
            e.status,
            e.startTime,
            e.endTime,
            e.positionCount,
            e.status == Status.Active && block.timestamp >= e.endTime
        );
    }

    function getPosition(uint256 electionId, uint256 positionId)
        external
        view
        returns (uint256 id, string memory name, uint256 candidateCount)
    {
        Position storage p = positions[electionId][positionId];
        require(p.id != 0, "BVS: no such position");
        return (p.id, p.name, p.candidateCount);
    }

    function getCandidate(uint256 electionId, uint256 positionId, uint256 candidateId)
        external
        view
        returns (uint256 id, string memory name, uint256 voteCount)
    {
        Candidate storage c = candidates[electionId][positionId][candidateId];
        require(c.id != 0, "BVS: no such candidate");
        return (c.id, c.name, c.voteCount);
    }

    /// @notice All positions + candidates + tallies for an election in ONE call.
    /// @dev Replaces the per-position/per-candidate read fan-out, so a results
    ///      page (even with thousands of viewers) makes a single RPC request.
    function getResults(uint256 electionId)
        external
        view
        electionExists(electionId)
        returns (PositionResult[] memory out)
    {
        Election storage e = elections[electionId];
        out = new PositionResult[](e.positionCount);
        for (uint256 pid = 1; pid <= e.positionCount; pid++) {
            Position storage p = positions[electionId][pid];
            CandidateResult[] memory crs = new CandidateResult[](p.candidateCount);
            for (uint256 cid = 1; cid <= p.candidateCount; cid++) {
                Candidate storage c = candidates[electionId][pid][cid];
                crs[cid - 1] = CandidateResult(c.id, c.name, c.voteCount);
            }
            out[pid - 1] = PositionResult(p.id, p.name, crs);
        }
    }

    function isApproved(uint256 electionId, bytes32 matricHash) external view returns (bool) {
        return approved[electionId][matricHash];
    }

    function hasVoted(uint256 electionId, uint256 positionId, bytes32 matricHash)
        external
        view
        returns (bool)
    {
        return votedFor[electionId][positionId][matricHash];
    }

    /// @notice Helper for clients: keccak256 of a normalized matric string.
    function matricHashOf(string calldata matric) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(matric));
    }
}
