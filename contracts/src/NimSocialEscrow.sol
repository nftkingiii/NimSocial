// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract NimSocialEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        None,
        Funded,
        Submitted,
        Disputed,
        Released,
        Refunded,
        Cancelled
    }

    struct Job {
        address client;
        address worker;
        address arbiter;
        uint128 amount;
        uint64 deadline;
        State state;
        bytes32 evidenceHash;
    }

    IERC20 public immutable paymentToken;
    mapping(bytes32 jobId => Job) private jobs;

    error AlreadyExists();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidState(State expected, State actual);
    error NotAuthorized();
    error DeadlineNotReached();

    event JobFunded(bytes32 indexed jobId, address indexed client, address indexed worker, uint256 amount, uint64 deadline, address arbiter);
    event EvidenceSubmitted(bytes32 indexed jobId, bytes32 indexed evidenceHash);
    event DisputeOpened(bytes32 indexed jobId, address indexed openedBy);
    event JobReleased(bytes32 indexed jobId, address indexed worker, uint256 amount);
    event JobRefunded(bytes32 indexed jobId, address indexed client, uint256 amount, bool timedOut);

    constructor(IERC20 token) {
        if (address(token) == address(0)) revert InvalidAddress();
        paymentToken = token;
    }

    function fundJob(bytes32 jobId, address worker, address arbiter, uint128 amount, uint64 deadline) external nonReentrant {
        if (jobs[jobId].state != State.None) revert AlreadyExists();
        if (
            worker == address(0) || arbiter == address(0) || worker == msg.sender ||
            arbiter == msg.sender || arbiter == worker
        ) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        jobs[jobId] = Job({
            client: msg.sender,
            worker: worker,
            arbiter: arbiter,
            amount: amount,
            deadline: deadline,
            state: State.Funded,
            evidenceHash: bytes32(0)
        });

        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        emit JobFunded(jobId, msg.sender, worker, amount, deadline, arbiter);
    }

    function submitEvidence(bytes32 jobId, bytes32 evidenceHash) external {
        Job storage job = jobs[jobId];
        if (msg.sender != job.worker) revert NotAuthorized();
        if (job.state != State.Funded) revert InvalidState(State.Funded, job.state);
        if (block.timestamp > job.deadline) revert InvalidDeadline();
        if (evidenceHash == bytes32(0)) revert InvalidAmount();
        job.evidenceHash = evidenceHash;
        job.state = State.Submitted;
        emit EvidenceSubmitted(jobId, evidenceHash);
    }

    function approve(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (msg.sender != job.client) revert NotAuthorized();
        if (job.state != State.Submitted) revert InvalidState(State.Submitted, job.state);
        job.state = State.Released;
        paymentToken.safeTransfer(job.worker, job.amount);
        emit JobReleased(jobId, job.worker, job.amount);
    }

    function openDispute(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        if (msg.sender != job.client && msg.sender != job.worker) revert NotAuthorized();
        if (job.state != State.Submitted) revert InvalidState(State.Submitted, job.state);
        job.state = State.Disputed;
        emit DisputeOpened(jobId, msg.sender);
    }

    function resolveDispute(bytes32 jobId, bool releaseToWorker) external nonReentrant {
        Job storage job = jobs[jobId];
        if (msg.sender != job.arbiter) revert NotAuthorized();
        if (job.state != State.Disputed) revert InvalidState(State.Disputed, job.state);

        if (releaseToWorker) {
            job.state = State.Released;
            paymentToken.safeTransfer(job.worker, job.amount);
            emit JobReleased(jobId, job.worker, job.amount);
        } else {
            job.state = State.Refunded;
            paymentToken.safeTransfer(job.client, job.amount);
            emit JobRefunded(jobId, job.client, job.amount, false);
        }
    }

    function refundAfterDeadline(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (msg.sender != job.client) revert NotAuthorized();
        if (job.state != State.Funded) revert InvalidState(State.Funded, job.state);
        if (block.timestamp <= job.deadline) revert DeadlineNotReached();
        job.state = State.Refunded;
        paymentToken.safeTransfer(job.client, job.amount);
        emit JobRefunded(jobId, job.client, job.amount, true);
    }

    function getJob(bytes32 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }
}
