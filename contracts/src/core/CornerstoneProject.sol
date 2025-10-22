// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {CornerstoneToken} from "./CornerstoneToken.sol";

interface ICornerstoneProject {
    // ---- Deposits ----
    function deposit(uint256 amount) external;
    function withdrawPrincipal(uint256 shares) external; // only after phase 6 complete

    // ---- Reserve ----
    function fundReserve(uint256 amount) external;
    function claimInterest(uint256 amount) external;

    // ---- Fundraise ----
    function refundIfMinNotMet(address user) external;

    // ---- Phase progression ----
    function closePhase(
        uint8 phaseId,
        string[] calldata docTypes,
        bytes32[] calldata docHashes,
        string[] calldata metadataURIs
    ) external;

    // ---- Developer withdrawals ----
    function withdrawPhaseFunds(uint256 amount) external; // dev only
    function getPhaseCap(uint8 phaseId) external view returns (uint256);
    function getPhaseWithdrawn(uint8 phaseId) external view returns (uint256);
    function withdrawableDevFunds() external view returns (uint256);

    // ---- Construction milestones ----
    function submitAppraisal(uint256 percentComplete, bytes32 appraisalHash) external;

    // ---- Sales / revenue ----
    function submitSalesProceeds(uint256 amount) external;
    function claimPrincipal(address user) external;
    function claimRevenue(address user) external;

    // ---- Safety controls ----
    function pause() external;
    function unpause() external;

    // ---- Token ----
    function token() external view returns (address);
}

interface ITransferHook {
    function onTokenTransfer(address from, address to, uint256 amount) external;
}

contract CornerstoneProject is ICornerstoneProject, Ownable, Pausable, ReentrancyGuard, ITransferHook {
    using SafeERC20 for IERC20;

    // Constants
    uint256 private constant BPS_DENOM = 10_000;
    uint256 private constant YEAR = 365 days;
    uint8 public constant NUM_PHASES = 5; // 0..5 total phases; 0 is fundraising, 1..5 are development phases

    // External assets
    IERC20 public immutable stablecoin;
    CornerstoneToken private _token;

    // Fundraise params
    uint256 public immutable minRaise;
    uint256 public immutable maxRaise;
    uint256 public immutable fundraiseDeadline;

    // Phase config (0..5)
    uint256[6] public phaseAPRsBps; // per phase (0..5) APR in bps (phase 0 typically 0)
    uint256[6] public phaseDurations; // informational only
    uint256[6] public phaseCapsBps; // withdraw caps per phase in bps of maxRaise (phase 0 typically 0)

    // State
    uint8 public currentPhase; // 0 = fundraising open; 1..5 = active development phases
    uint8 public lastClosedPhase; // highest fully closed phase; 0 initially
    bool public fundraiseClosed;
    bool public fundraiseSuccessful;

    uint256 public totalRaised;

    // Developer withdrawals tracking
    uint256 public totalDevWithdrawn;
    mapping(uint8 => uint256) public phaseWithdrawn; // amount withdrawn attributed to a given phase

    // Phase 5 progressive unlock
    uint256 public phase5PercentComplete; // 0..100
    bytes32 public lastAppraisalHash;

    // Accounting buckets
    uint256 public reserveBalance; // developer-funded reserve for interest
    uint256 public poolBalance; // investors' pool balance (principal + proceeds + harvested interest - paid out)

    // Principal / proceeds
    uint256 public principalBuffer; // proceeds available to repay principal
    uint256 public principalRedeemed; // principal redeemed by holders (burned shares)

    // Interest accrual
    uint256 public accrualBase; // NAV base for interest accrual and compounding
    uint256 public lastAccrualTs;

    // Per-share distribution accounting (magnified by 1e18)
    uint256 private constant ACC_PREC = 1e18;
    uint256 public interestPerShareX18;
    uint256 public revenuePerShareX18;

    mapping(address => int256) private interestCorrection;
    mapping(address => int256) private revenueCorrection;
    mapping(address => uint256) private interestWithdrawn;
    mapping(address => uint256) private revenueWithdrawn;

    // Events
    event Deposit(address indexed user, uint256 amount, uint256 sharesMinted);
    event InterestClaimed(address indexed user, uint256 amount);
    event ReserveFunded(uint256 amount, address indexed by);
    event FundraiseClosed(bool successful);
    event PhaseClosed(uint8 indexed phaseId, string[] docTypes, bytes32[] docHashes, string[] metadataURIs);
    event PhaseFundsWithdrawn(uint8 indexed phaseId, uint256 amount);
    event AppraisalSubmitted(uint256 percentComplete, bytes32 appraisalHash);
    event SalesProceedsSubmitted(uint256 amount);
    event PrincipalClaimed(address indexed user, uint256 amount);
    event RevenueClaimed(address indexed user, uint256 amount);
    event PhaseConfiguration(uint256[6] aprBps, uint256[6] durations, uint256[6] capBps, uint256[6] phaseCaps);

    modifier onlyDev() {
        require(msg.sender == owner(), "dev only");
        _;
    }

    modifier updateAccrual() {
        _accrueInterest();
        _;
    }

    constructor(
        address developer,
        address stablecoin_,
        string memory name_,
        string memory symbol_,
        uint256 minRaise_,
        uint256 maxRaise_,
        uint256 fundraiseDeadline_,
        uint256[6] memory phaseAPRs_,
        uint256[6] memory phaseDurations_,
        uint256[6] memory phaseCapsBps_
    ) Ownable(developer) {
        require(stablecoin_ != address(0), "stablecoin required");
        stablecoin = IERC20(stablecoin_);
        minRaise = minRaise_;
        maxRaise = maxRaise_;
        fundraiseDeadline = fundraiseDeadline_;
        phaseAPRsBps = phaseAPRs_;
        phaseDurations = phaseDurations_;
        phaseCapsBps = phaseCapsBps_;

        // enforce sum of development phase caps (1..5) ≤ 100%
        uint256 sumCaps;
        for (uint8 i = 1; i <= NUM_PHASES; i++) {
            sumCaps += phaseCapsBps_[i];
        }
        require(sumCaps <= BPS_DENOM, "caps sum > 100%");

        // Start in fundraising pseudo-phase 0
        currentPhase = 0;
        lastClosedPhase = 0;
        lastAccrualTs = block.timestamp;

        // Deploy token with provided per-project name/symbol
        _token = new CornerstoneToken(name_, symbol_, address(this));

        // Emit consolidated phase configuration for indexer
        uint256[6] memory phaseCaps;
        for (uint8 i = 0; i <= NUM_PHASES; i++) {
            phaseCaps[i] = (maxRaise * phaseCapsBps_[i]) / BPS_DENOM;
        }
        emit PhaseConfiguration(phaseAPRs_, phaseDurations_, phaseCapsBps_, phaseCaps);
    }

    // ---- View helpers ----
    function token() external view returns (address) {
        return address(_token);
    }

    function getPhaseCap(uint8 phaseId) public view returns (uint256) {
        require(phaseId <= NUM_PHASES, "phase 0..5");
        return (maxRaise * phaseCapsBps[phaseId]) / BPS_DENOM;
    }

    function getPhaseWithdrawn(uint8 phaseId) external view returns (uint256) {
        return phaseWithdrawn[phaseId];
    }

    // ---- Deposits ----
    function deposit(uint256 amount) external nonReentrant whenNotPaused updateAccrual {
        // Deposits allowed in phases 0..4 (not in 5) and not if fundraise failed
        require(currentPhase != NUM_PHASES, "deposits closed in phase 5");
        require(!(fundraiseClosed && !fundraiseSuccessful), "fundraise failed");
        if (currentPhase == 0) {
            require(block.timestamp <= fundraiseDeadline && !fundraiseClosed, "fundraise ended");
        }
        require(amount > 0, "amount=0");

        totalRaised += amount;
        poolBalance += amount;
        accrualBase += amount;

        // If threshold is reached at any time, mark fundraise as successful
        if (!fundraiseSuccessful && totalRaised >= minRaise) {
            fundraiseSuccessful = true;
        }

        stablecoin.safeTransferFrom(msg.sender, address(this), amount);
        _token.mint(msg.sender, amount);

        // transfer hook will set corrections so new depositors don't get past distributions

        emit Deposit(msg.sender, amount, amount);
    }

    // ---- Phases & fundraise lifecycle ----
    function closePhase(
        uint8 phaseId,
        string[] calldata docTypes,
        bytes32[] calldata docHashes,
        string[] calldata metadataURIs
    ) external onlyDev whenNotPaused updateAccrual {
        require(phaseId <= NUM_PHASES, "invalid phase");
        // Only allow closing the current active phase (0..5)
        require(phaseId == currentPhase, "not current phase");

        // Docs are required for all phases, including phase 0
        require(docTypes.length > 0, "docs required");
        require(docTypes.length == docHashes.length && docTypes.length == metadataURIs.length, "docs length mismatch");
        emit PhaseClosed(phaseId, docTypes, docHashes, metadataURIs);

        if (phaseId == 0) {
            require(totalRaised >= minRaise, "min raise not met");
            // Start Phase 1 with required docs. Fundraising remains open beyond phase 0.
            // Mark success flag opportunistically if threshold already met.
            if (!fundraiseSuccessful && totalRaised >= minRaise) {
                fundraiseSuccessful = true;
            }
            currentPhase = 1; // Phase 1 begins
            lastClosedPhase = 0;
            return;
        }

        // For phases 1..5, mark closed and advance to next phase (phase 5 remains current once closed)
        lastClosedPhase = phaseId;
        if (currentPhase < NUM_PHASES) {
            currentPhase += 1;
        }

        // Close fundraising when final stage (5) starts, i.e., after closing phase 4
        if (phaseId == 4 && !fundraiseClosed) {
            fundraiseClosed = true;
            // success status reflects whether minRaise was ever reached
            emit FundraiseClosed(fundraiseSuccessful);
        }
    }

    // ---- Developer withdrawals under caps ----
    function withdrawPhaseFunds(uint256 amount) external onlyDev nonReentrant whenNotPaused updateAccrual {
        require(fundraiseSuccessful, "fundraise failed");
        require(amount > 0, "amount=0");

        uint256 unlocked = _cumulativeUnlocked();
        require(totalDevWithdrawn + amount <= unlocked, "exceeds caps");
        require(poolBalance >= amount, "insufficient pool");

        totalDevWithdrawn += amount;
        uint8 phaseAttr = _phaseAttributionForWithdrawal();
        if (phaseAttr <= NUM_PHASES) {
            phaseWithdrawn[phaseAttr] += amount;
        }

        poolBalance -= amount;
        stablecoin.safeTransfer(owner(), amount);
        emit PhaseFundsWithdrawn(phaseAttr, amount);
    }

    function withdrawableDevFunds() external view returns (uint256) {
        if (!fundraiseSuccessful) return 0;
        uint256 unlocked = _cumulativeUnlocked();
        if (unlocked <= totalDevWithdrawn) return 0;
        uint256 remainingUnderCap = unlocked - totalDevWithdrawn;
        return remainingUnderCap < poolBalance ? remainingUnderCap : poolBalance;
    }

    function _cumulativeUnlocked() internal view returns (uint256) {
        uint256 unlocked;
        if (currentPhase >= 1) {
            unlocked += getPhaseCap(0);
        }
        uint8 lc = lastClosedPhase;
        // Phases 1..4: unlock upon closure
        for (uint8 p = 1; p <= 4; p++) {
            if (p <= lc) unlocked += getPhaseCap(p);
        }
        // Phase 5: progressive while active, full when closed
        uint256 cap5 = getPhaseCap(5);
        if (lc >= 5) {
            unlocked += cap5;
        } else if (currentPhase == 5) {
            unlocked += (cap5 * phase5PercentComplete) / 100;
        }
        return unlocked;
    }

    function _phaseAttributionForWithdrawal() internal view returns (uint8) {
        if (currentPhase == 5 && lastClosedPhase < 5) {
            return 5; // progressive unlock attribution
        }
        if (lastClosedPhase >= 1 && lastClosedPhase <= NUM_PHASES) return lastClosedPhase;
        return 0;
    }

    // ---- Appraisal for Phase 5 progressive unlock ----
    function submitAppraisal(
        uint256 percentComplete,
        bytes32 appraisalHash
    ) external onlyDev whenNotPaused updateAccrual {
        require(currentPhase == 5, "not phase 5");
        require(percentComplete <= 100, ">100");
        require(percentComplete >= phase5PercentComplete, "must be >= last");
        phase5PercentComplete = percentComplete;
        lastAppraisalHash = appraisalHash;
        emit AppraisalSubmitted(percentComplete, appraisalHash);
    }

    // ---- Reserve and Interest ----
    function fundReserve(uint256 amount) external onlyDev nonReentrant whenNotPaused {
        require(amount > 0, "amount=0");
        reserveBalance += amount;
        stablecoin.safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveFunded(amount, msg.sender);
    }

    function accrueInterest() external whenNotPaused updateAccrual {
        // no-op wrapper to expose accrual
    }

    function claimInterest(uint256 amount) external nonReentrant whenNotPaused updateAccrual {
        uint256 claimable = _claimableInterest(msg.sender);
        require(amount > 0 && amount <= claimable, "bad amount");
        interestWithdrawn[msg.sender] += amount;
        // Paying out interest reduces pool and accrual base
        require(poolBalance >= amount, "pool underflow");
        poolBalance -= amount;
        accrualBase = accrualBase >= amount ? accrualBase - amount : 0;
        stablecoin.safeTransfer(msg.sender, amount);
        emit InterestClaimed(msg.sender, amount);
    }

    // ---- Sales / revenue ----
    function submitSalesProceeds(uint256 amount) external onlyDev nonReentrant whenNotPaused updateAccrual {
        require(amount > 0, "amount=0");
        stablecoin.safeTransferFrom(msg.sender, address(this), amount);

        poolBalance += amount;
        accrualBase += amount; // proceeds increase NAV, start compounding

        // First allocate to principal buffer
        principalBuffer += amount;

        uint256 principalOutstanding = totalRaised - principalRedeemed; // deposits minus redeemed (no refunds post-success)
        if (principalBuffer > principalOutstanding) {
            uint256 revenueAmt = principalBuffer - principalOutstanding;
            principalBuffer = principalOutstanding; // cap buffer to outstanding principal
            _distributeRevenue(revenueAmt);
        }

        emit SalesProceedsSubmitted(amount);
    }

    function withdrawPrincipal(uint256 shares) external nonReentrant whenNotPaused updateAccrual {
        require(fundraiseSuccessful, "fundraise failed");
        require(shares > 0, "shares=0");
        require(_token.balanceOf(msg.sender) >= shares, "insufficient shares");

        // ensure principal buffer has sufficient funds
        require(principalBuffer >= shares, "insufficient principal");

        // Burn first to update corrections before transfer
        _token.burn(msg.sender, shares);

        principalBuffer -= shares;
        principalRedeemed += shares;

        // Paying principal reduces pool and accrual base
        require(poolBalance >= shares, "pool underflow");
        poolBalance -= shares;
        accrualBase = accrualBase >= shares ? accrualBase - shares : 0;

        stablecoin.safeTransfer(msg.sender, shares);
        emit PrincipalClaimed(msg.sender, shares);
    }

    // Interface requires but Option A selected: we keep it disabled
    function claimPrincipal(address /*user*/) external pure {
        revert("use withdrawPrincipal");
    }

    function claimRevenue(address user) external nonReentrant whenNotPaused updateAccrual {
        uint256 amount = _claimableRevenue(user);
        require(amount > 0, "none");
        revenueWithdrawn[user] += amount;
        // Paying out revenue reduces pool but not accrual base
        require(poolBalance >= amount, "pool underflow");
        poolBalance -= amount;
        stablecoin.safeTransfer(user, amount);
        emit RevenueClaimed(user, amount);
    }

    // ---- Fundraise refunds ----
    function refundIfMinNotMet(address user) public nonReentrant whenNotPaused updateAccrual {
        if (!fundraiseSuccessful && !fundraiseClosed && block.timestamp > fundraiseDeadline) {
            fundraiseClosed = true;
            emit FundraiseClosed(false);
        }
        require(fundraiseClosed && !fundraiseSuccessful, "not failed");
        require(user != address(0), "bad user");
        uint256 bal = _token.balanceOf(user);
        require(bal > 0, "no balance");
        _token.burn(user, bal);
        require(poolBalance >= bal, "pool underflow");
        poolBalance -= bal;
        accrualBase = accrualBase >= bal ? accrualBase - bal : 0;
        stablecoin.safeTransfer(user, bal);
    }

    // ---- Pause ----
    function pause() external onlyDev {
        _pause();
    }

    function unpause() external onlyDev {
        _unpause();
    }

    // ---- Transfer hook from token to handle corrections ----
    function onTokenTransfer(address from, address to, uint256 amount) external {
        require(msg.sender == address(_token), "only token");
        if (amount == 0) return;
        int256 iDelta = int256(interestPerShareX18 * amount);
        int256 rDelta = int256(revenuePerShareX18 * amount);
        if (from != address(0)) {
            interestCorrection[from] += iDelta;
            revenueCorrection[from] += rDelta;
        }
        if (to != address(0)) {
            interestCorrection[to] -= iDelta;
            revenueCorrection[to] -= rDelta;
        }
    }

    // ---- Internal: Interest accrual ----
    function _accrueInterest() internal {
        // Do not accrue before successful fundraise and entering Phase 1
        if (!(fundraiseSuccessful && currentPhase >= 1)) {
            lastAccrualTs = block.timestamp;
            return;
        }
        uint256 ts = block.timestamp;
        if (ts <= lastAccrualTs) return;
        uint256 dt = ts - lastAccrualTs;
        lastAccrualTs = ts;

        uint256 aprBps = _currentAPR();
        if (aprBps == 0 || accrualBase == 0) return;

        // interest = base * apr * dt / (BPS * YEAR)
        uint256 interest = (accrualBase * aprBps * dt) / (BPS_DENOM * YEAR);
        if (interest == 0) return;

        require(reserveBalance >= interest, "reserve depleted");
        reserveBalance -= interest;
        poolBalance += interest;
        accrualBase += interest; // compounding

        uint256 supply = _token.totalSupply();
        if (supply > 0) {
            interestPerShareX18 += (interest * ACC_PREC) / supply;
        }
    }

    function _currentAPR() internal view returns (uint256) {
        return phaseAPRsBps[currentPhase];
    }

    // ---- Internal: Revenue distribution ----
    function _distributeRevenue(uint256 amount) internal {
        if (amount == 0) return;
        uint256 supply = _token.totalSupply();
        if (supply == 0) return; // nothing to distribute to
        revenuePerShareX18 += (amount * ACC_PREC) / supply;
        // Funds are already in poolBalance; users will pull via claimRevenue
    }

    // ---- Internal: Claimable calculations ----
    function _claimableInterest(address user) internal view returns (uint256) {
        uint256 bal = _token.balanceOf(user);
        uint256 accum = (bal * interestPerShareX18) / ACC_PREC;
        int256 corrected = int256(accum) + (interestCorrection[user] / int256(ACC_PREC));
        if (corrected <= 0) return 0;
        uint256 accrued = uint256(corrected);
        if (accrued <= interestWithdrawn[user]) return 0;
        return accrued - interestWithdrawn[user];
    }

    function _claimableRevenue(address user) internal view returns (uint256) {
        uint256 bal = _token.balanceOf(user);
        uint256 accum = (bal * revenuePerShareX18) / ACC_PREC;
        int256 corrected = int256(accum) + (revenueCorrection[user] / int256(ACC_PREC));
        if (corrected <= 0) return 0;
        uint256 accrued = uint256(corrected);
        if (accrued <= revenueWithdrawn[user]) return 0;
        return accrued - revenueWithdrawn[user];
    }

    // Public helpers
    function claimableInterest(address user) external view returns (uint256) {
        return _claimableInterest(user);
    }

    function claimableRevenue(address user) external view returns (uint256) {
        return _claimableRevenue(user);
    }

    // ---- Utils ----
    function _toHexString(address a) internal pure returns (string memory) {
        bytes20 data = bytes20(a);
        bytes memory hexChars = "0123456789abcdef";
        bytes memory str = new bytes(2 + 40);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = hexChars[uint8(data[i] >> 4)];
            str[3 + i * 2] = hexChars[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }

    function _shortHex(address a) internal pure returns (string memory) {
        bytes20 data = bytes20(a);
        bytes memory hexChars = "0123456789abcdef";
        bytes memory str = new bytes(4);
        // last two bytes
        uint8 b1 = uint8(data[18]);
        uint8 b2 = uint8(data[19]);
        str[0] = hexChars[b1 >> 4];
        str[1] = hexChars[b1 & 0x0f];
        str[2] = hexChars[b2 >> 4];
        str[3] = hexChars[b2 & 0x0f];
        return string(str);
    }
}
