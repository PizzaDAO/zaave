// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IPool} from "./interfaces/IPool.sol";

/// @title Zaave
/// @notice No-loss pizza staking on Aave v3. Deposits are supplied to Aave; once a month ("Za Day")
///         a snapshot is taken and each user's yield above principal is converted, lazily, into
///         USDC "pizza credit" that can be cashed out or redeemed for a gift card.
///         Principal is always withdrawable. There is no fee and no admin access to user funds.
contract Zaave is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ constants
    uint256 public constant DEFAULT_PIE_PRICE = 25e6;
    uint256 public constant MIN_PIE_PRICE = 1e6;
    uint256 public constant MAX_PIE_PRICE = 1000e6;
    /// @dev Virtual share offset that blocks first-depositor inflation attacks.
    uint256 internal constant VIRTUAL_SHARES = 1e6;

    // ------------------------------------------------------------------ immutables
    address public immutable USDC;
    address public immutable AUSDC;
    address public immutable POOL;

    // ------------------------------------------------------------------ state
    uint256 public epoch;
    uint256 public lastZaDay;
    uint256 public totalPrincipal;
    uint256 public totalCredit;
    uint256 public totalShares;
    uint256 public tvlCap;
    address public fulfillment;
    uint256 public nextRequestId;

    mapping(address => uint256) public principal;
    mapping(address => uint256) public shares;
    mapping(address => uint256) public credit;
    mapping(address => uint256) public harvestedEpoch;
    mapping(address => uint256) internal _piePrice;
    /// @notice assets (aUSDC) per 1e18 shares, snapshotted at each Za Day.
    mapping(uint256 => uint256) public epochSharePrice;

    // ------------------------------------------------------------------ events
    event Deposited(address indexed user, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, uint256 amount, uint256 shares);
    event Harvested(address indexed user, uint256 indexed epoch, uint256 amount);
    event ZaDay(uint256 indexed epoch, uint256 sharePrice, uint256 timestamp);
    event PiePriceSet(address indexed user, uint256 price);
    event CashedOut(address indexed user, uint256 amount);
    event GiftCardRequested(uint256 indexed requestId, address indexed user, uint256 amount);
    event TvlCapSet(uint256 tvlCap);
    event FulfillmentSet(address indexed fulfillment);

    // ------------------------------------------------------------------ errors
    error ZeroAmount();
    error RenounceDisabled();
    error ZeroAddress();
    error TvlCapExceeded();
    error InsufficientPrincipal();
    error InsufficientValue();
    error InsufficientCredit();
    error PiePriceOutOfBounds();
    error ZaDayNotReached();
    error FulfillmentNotSet();
    error ProtectedToken();

    constructor(address pool, address usdc, address owner_, uint256 tvlCap_) Ownable(owner_) {
        if (pool == address(0) || usdc == address(0)) revert ZeroAddress();
        POOL = pool;
        USDC = usdc;
        address aToken = IPool(pool).getReserveData(usdc).aTokenAddress;
        if (aToken == address(0)) revert ZeroAddress();
        AUSDC = aToken;
        tvlCap = tvlCap_;
        lastZaDay = block.timestamp;
        IERC20(usdc).forceApprove(pool, type(uint256).max);
    }

    // ================================================================== views

    /// @notice aUSDC held (stake + unharvested yield). Idle credit backing is not included.
    function totalAssets() public view returns (uint256) {
        return IERC20(AUSDC).balanceOf(address(this));
    }

    /// @notice Earliest timestamp at which zaDay() can succeed (1st of the month after lastZaDay).
    function nextZaDayAt() public view returns (uint256) {
        uint256 idx = _monthIndex(lastZaDay) + 1;
        return _daysFromCivil(idx / 12, (idx % 12) + 1) * 1 days;
    }

    function piePriceOf(address user) public view returns (uint256) {
        uint256 p = _piePrice[user];
        return p == 0 ? DEFAULT_PIE_PRICE : p;
    }

    /// @notice Current USDC value of the user's shares.
    function valueOf(address user) public view returns (uint256) {
        return _toAssets(shares[user]);
    }

    /// @notice Live, unharvested yield: value - principal (0 floor).
    function pendingYield(address user) public view returns (uint256) {
        uint256 v = valueOf(user);
        uint256 p = principal[user];
        return v > p ? v - p : 0;
    }

    /// @notice What harvest(user) would credit right now.
    function claimableYield(address user) public view returns (uint256 y) {
        (y,) = _claimable(user);
    }

    // ================================================================== user actions

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (totalPrincipal + amount > tvlCap) revert TvlCapExceeded();
        _harvest(msg.sender);

        uint256 minted = _toShares(amount); // priced before the new assets arrive
        IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        IPool(POOL).supply(USDC, amount, address(this), 0);

        shares[msg.sender] += minted;
        totalShares += minted;
        principal[msg.sender] += amount;
        totalPrincipal += amount;
        emit Deposited(msg.sender, amount, minted);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _harvest(msg.sender);
        if (amount > principal[msg.sender]) revert InsufficientPrincipal();
        // Withdrawing the full principal goes through the withdrawAll path so 1-2 wei of Aave
        // rounding dust (value slightly below principal) can't block a full exit.
        if (amount == principal[msg.sender]) return _withdrawAll();
        if (amount > valueOf(msg.sender)) revert InsufficientValue();
        _withdraw(msg.sender, amount, _toSharesUp(amount), amount);
    }

    /// @notice Withdraw min(principal, value). Any remaining yield shares stay and are credited
    ///         on the next Za Day. If the position is worth less than principal (loss or rounding
    ///         dust) everything is withdrawn and the principal record is cleared.
    function withdrawAll() external nonReentrant {
        _harvest(msg.sender);
        _withdrawAll();
    }

    function _withdrawAll() internal {
        uint256 p = principal[msg.sender];
        uint256 v = valueOf(msg.sender);
        if (p == 0) revert ZeroAmount();
        if (v >= p) {
            _withdraw(msg.sender, p, _toSharesUp(p), p);
        } else {
            _withdraw(msg.sender, v, shares[msg.sender], p);
        }
    }

    function harvest(address user) external nonReentrant {
        _harvest(user);
    }

    /// @notice Permissionless monthly snapshot. Callable once the UTC calendar month is later
    ///         than the month of the previous Za Day (or of deployment, for the first one).
    function zaDay() external nonReentrant {
        if (block.timestamp < nextZaDayAt()) revert ZaDayNotReached();
        uint256 newEpoch = ++epoch;
        lastZaDay = block.timestamp;
        uint256 price = ((totalAssets() + 1) * 1e18) / (totalShares + VIRTUAL_SHARES);
        epochSharePrice[newEpoch] = price;
        emit ZaDay(newEpoch, price, block.timestamp);
    }

    function setPiePrice(uint256 price) external {
        if (price < MIN_PIE_PRICE || price > MAX_PIE_PRICE) revert PiePriceOutOfBounds();
        _piePrice[msg.sender] = price;
        emit PiePriceSet(msg.sender, price);
    }

    function cashOut(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > credit[msg.sender]) revert InsufficientCredit();
        credit[msg.sender] -= amount;
        totalCredit -= amount;
        IERC20(USDC).safeTransfer(msg.sender, amount);
        emit CashedOut(msg.sender, amount);
    }

    function redeemForGiftCard(uint256 amount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 requestId)
    {
        address f = fulfillment;
        if (f == address(0)) revert FulfillmentNotSet();
        if (amount == 0) revert ZeroAmount();
        if (amount > credit[msg.sender]) revert InsufficientCredit();
        credit[msg.sender] -= amount;
        totalCredit -= amount;
        requestId = nextRequestId++;
        IERC20(USDC).safeTransfer(f, amount);
        emit GiftCardRequested(requestId, msg.sender, amount);
    }

    // ================================================================== admin

    /// @dev Disabled: renouncing while paused would permanently block deposits and gift cards.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    function setTvlCap(uint256 cap) external onlyOwner {
        tvlCap = cap;
        emit TvlCapSet(cap);
    }

    function setFulfillment(address f) external onlyOwner {
        fulfillment = f;
        emit FulfillmentSet(f);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recover tokens sent here by mistake. Never USDC or aUSDC.
    function rescue(address token) external onlyOwner {
        if (token == USDC || token == AUSDC) revert ProtectedToken();
        IERC20(token).safeTransfer(owner(), IERC20(token).balanceOf(address(this)));
    }

    // ================================================================== internals

    function _withdraw(address user, uint256 amount, uint256 sharesBurned, uint256 principalCleared)
        internal
    {
        shares[user] -= sharesBurned;
        totalShares -= sharesBurned;
        principal[user] -= principalCleared;
        totalPrincipal -= principalCleared;
        IPool(POOL).withdraw(USDC, amount, user);
        emit Withdrawn(user, amount, sharesBurned);
    }

    function _harvest(address user) internal {
        uint256 e = epoch;
        if (harvestedEpoch[user] >= e) return;
        (uint256 y, uint256 burn) = _claimable(user);
        harvestedEpoch[user] = e;
        if (y == 0) return;

        shares[user] -= burn;
        totalShares -= burn;
        credit[user] += y;
        totalCredit += y;
        IPool(POOL).withdraw(USDC, y, address(this));
        emit Harvested(user, e, y);
    }

    /// @dev yield above principal as of the latest epoch snapshot, and the shares to burn for it.
    function _claimable(address user) internal view returns (uint256 y, uint256 burn) {
        uint256 e = epoch;
        if (harvestedEpoch[user] >= e) return (0, 0);
        uint256 s = shares[user];
        uint256 epochValue = (s * epochSharePrice[e]) / 1e18;
        uint256 p = principal[user];
        if (epochValue <= p) return (0, 0);
        y = epochValue - p;
        burn = _toSharesUp(y);
        if (burn > s) {
            burn = s;
            y = _toAssets(s);
        }
    }

    function _toShares(uint256 assets) internal view returns (uint256) {
        return (assets * (totalShares + VIRTUAL_SHARES)) / (totalAssets() + 1);
    }

    function _toSharesUp(uint256 assets) internal view returns (uint256) {
        uint256 d = totalAssets() + 1;
        return (assets * (totalShares + VIRTUAL_SHARES) + d - 1) / d;
    }

    function _toAssets(uint256 s) internal view returns (uint256) {
        return (s * (totalAssets() + 1)) / (totalShares + VIRTUAL_SHARES);
    }

    // ---- calendar math (Howard Hinnant's civil-date algorithms) ----

    /// @dev year * 12 + (month - 1) for a unix timestamp.
    function _monthIndex(uint256 ts) internal pure returns (uint256) {
        uint256 z = ts / 1 days + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        uint256 y = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        uint256 m = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y += 1;
        return y * 12 + (m - 1);
    }

    /// @dev days since unix epoch of the 1st of (year, month), month in 1..12.
    function _daysFromCivil(uint256 year, uint256 month) internal pure returns (uint256) {
        uint256 y = month <= 2 ? year - 1 : year;
        uint256 era = y / 400;
        uint256 yoe = y - era * 400;
        uint256 mp = month > 2 ? month - 3 : month + 9;
        uint256 doy = (153 * mp + 2) / 5; // day 1 => +0
        uint256 doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }
}
