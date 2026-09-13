// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal fixed-supply ERC-20 used by the DOXA launchpad.
contract DOXAToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable launchpad;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    error InvalidAddress();
    error InsufficientBalance();
    error InsufficientAllowance();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, address launchpad_, uint256 supply_) {
        if (launchpad_ == address(0)) revert InvalidAddress();
        name = name_;
        symbol = symbol_;
        launchpad = launchpad_;
        totalSupply = supply_;
        balanceOf[launchpad_] = supply_;
        emit Transfer(address(0), launchpad_, supply_);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}

/// @title DOXA Launchpad V2
/// @notice Fixed 1B supply, 78/22 curve-liquidity allocation and a USDC curve on Arc.
/// @dev Graduation emits a migration-ready event. Actual DEX migration remains a
/// separately audited integration, so no custodial LP withdrawal path exists here.
contract DOXALaunchpad {
    uint256 public constant BPS = 10_000;
    uint256 public constant FEE_BPS = 100;
    uint256 public constant CREATOR_FEE_BPS = 5;
    uint256 public constant TOKEN_SUPPLY = 1_000_000_000 ether;
    uint256 public constant BONDING_CURVE_SUPPLY = 780_000_000 ether;
    uint256 public constant DEX_LIQUIDITY_SUPPLY = 220_000_000 ether;
    uint256 public constant CREATOR_BUY_LIMIT = 30_000_000 ether;
    uint256 public constant VIRTUAL_NATIVE_RESERVE = 1_000 ether;
    uint256 public constant DEPLOY_FEE = 5 ether;

    struct Launch {
        address token;
        address creator;
        string name;
        string symbol;
        string description;
        string metadataURI;
        uint256 virtualNativeReserve;
        uint256 virtualTokenReserve;
        uint256 nativeReserve;
        uint256 tokenReserve;
        uint256 createdAt;
        bool graduated;
    }

    address public admin;
    address public treasury;
    uint256 public graduationTarget;
    uint256 public launchCount;
    bool public paused;

    mapping(uint256 => Launch) private launches;
    mapping(address => string) public metadataURI;
    uint256 private reentrancyState = 1;

    error Unauthorized();
    error InvalidAddress();
    error InvalidParameter();
    error Paused();
    error UnknownLaunch();
    error AlreadyGraduated();
    error EmptyValue();
    error Slippage();
    error TransferFailed();
    error Reentrancy();
    error IncorrectDeployFee();
    error CreatorBuyLimitExceeded();

    event TokenCreated(
        uint256 indexed launchId,
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        string metadataURI
    );
    event Trade(
        uint256 indexed launchId,
        address indexed trader,
        bool indexed isBuy,
        uint256 tokenAmount,
        uint256 usdcAmount,
        uint256 price,
        uint256 timestamp
    );
    event FeesDistributed(
        address indexed token,
        address indexed creator,
        uint256 creatorFee,
        uint256 platformFee
    );
    event Graduated(
        uint256 indexed launchId,
        address indexed token,
        uint256 nativeReserve,
        uint256 remainingCurveTokens,
        uint256 liquidityTokens
    );
    event TreasuryUpdated(address indexed treasury);
    event GraduationTargetUpdated(uint256 target);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event PausedUpdated(bool paused);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (reentrancyState != 1) revert Reentrancy();
        reentrancyState = 2;
        _;
        reentrancyState = 1;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor(address admin_, address treasury_, uint256 graduationTarget_) {
        if (admin_ == address(0) || treasury_ == address(0)) revert InvalidAddress();
        if (graduationTarget_ == 0) revert InvalidParameter();
        admin = admin_;
        treasury = treasury_;
        graduationTarget = graduationTarget_;
    }

    /// @notice Creates a token and permanently registers its IPFS metadata URI.
    /// The fixed 5 USDC fee is forwarded to the platform treasury atomically.
    function createLaunch(
        string calldata name_,
        string calldata symbol_,
        string calldata description_,
        string calldata metadataURI_
    ) external payable whenNotPaused returns (uint256 launchId, address token) {
        if (msg.value != DEPLOY_FEE) revert IncorrectDeployFee();
        if (bytes(name_).length == 0 || bytes(symbol_).length == 0 || bytes(symbol_).length > 12) {
            revert InvalidParameter();
        }
        if (bytes(metadataURI_).length == 0) revert InvalidParameter();

        _sendNative(treasury, msg.value);
        launchId = launchCount++;
        token = address(new DOXAToken(name_, symbol_, address(this), TOKEN_SUPPLY));
        launches[launchId] = Launch({
            token: token,
            creator: msg.sender,
            name: name_,
            symbol: symbol_,
            description: description_,
            metadataURI: metadataURI_,
            virtualNativeReserve: VIRTUAL_NATIVE_RESERVE,
            virtualTokenReserve: BONDING_CURVE_SUPPLY,
            nativeReserve: 0,
            tokenReserve: BONDING_CURVE_SUPPLY,
            createdAt: block.timestamp,
            graduated: false
        });
        metadataURI[token] = metadataURI_;
        emit TokenCreated(launchId, token, msg.sender, name_, symbol_, metadataURI_);
    }

    function buy(uint256 launchId, uint256 minTokenOut)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 tokenOut)
    {
        Launch storage launch = _launch(launchId);
        if (launch.graduated) revert AlreadyGraduated();
        if (msg.value == 0) revert EmptyValue();

        uint256 fee = (msg.value * FEE_BPS) / BPS;
        uint256 creatorFee = (msg.value * CREATOR_FEE_BPS) / BPS;
        uint256 platformFee = fee - creatorFee;
        uint256 netValue = msg.value - fee;
        tokenOut = _quoteBuy(launch, netValue);
        if (tokenOut == 0 || tokenOut > launch.tokenReserve || tokenOut < minTokenOut) revert Slippage();
        if (msg.sender == launch.creator && DOXAToken(launch.token).balanceOf(msg.sender) + tokenOut > CREATOR_BUY_LIMIT) {
            revert CreatorBuyLimitExceeded();
        }

        launch.virtualNativeReserve += netValue;
        launch.virtualTokenReserve -= tokenOut;
        launch.nativeReserve += netValue;
        launch.tokenReserve -= tokenOut;
        DOXAToken(launch.token).transfer(msg.sender, tokenOut);
        _sendNative(launch.creator, creatorFee);
        _sendNative(treasury, platformFee);

        emit FeesDistributed(launch.token, launch.creator, creatorFee, platformFee);
        emit Trade(launchId, msg.sender, true, tokenOut, msg.value, _currentPrice(launch), block.timestamp);
        _graduateIfReady(launchId, launch);
    }

    function sell(uint256 launchId, uint256 tokenIn, uint256 minNativeOut)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 nativeOut)
    {
        Launch storage launch = _launch(launchId);
        if (launch.graduated) revert AlreadyGraduated();
        if (tokenIn == 0) revert EmptyValue();

        uint256 grossValue = _quoteSell(launch, tokenIn);
        uint256 fee = (grossValue * FEE_BPS) / BPS;
        uint256 creatorFee = (grossValue * CREATOR_FEE_BPS) / BPS;
        uint256 platformFee = fee - creatorFee;
        nativeOut = grossValue - fee;
        if (grossValue > launch.nativeReserve || nativeOut < minNativeOut) revert Slippage();

        DOXAToken(launch.token).transferFrom(msg.sender, address(this), tokenIn);
        launch.virtualNativeReserve -= grossValue;
        launch.virtualTokenReserve += tokenIn;
        launch.nativeReserve -= grossValue;
        launch.tokenReserve += tokenIn;
        _sendNative(launch.creator, creatorFee);
        _sendNative(treasury, platformFee);
        _sendNative(msg.sender, nativeOut);

        emit FeesDistributed(launch.token, launch.creator, creatorFee, platformFee);
        emit Trade(launchId, msg.sender, false, tokenIn, grossValue, _currentPrice(launch), block.timestamp);
    }

    function quoteBuy(uint256 launchId, uint256 nativeIn) external view returns (uint256) {
        return _quoteBuy(_launchView(launchId), nativeIn);
    }

    function quoteSell(uint256 launchId, uint256 tokenIn) external view returns (uint256) {
        return _quoteSell(_launchView(launchId), tokenIn);
    }

    function getLaunch(uint256 launchId) external view returns (Launch memory) {
        return _launchView(launchId);
    }

    function getLaunches(uint256 offset, uint256 limit) external view returns (Launch[] memory page) {
        if (offset >= launchCount) return new Launch[](0);
        uint256 end = offset + limit;
        if (end > launchCount) end = launchCount;
        page = new Launch[](end - offset);
        for (uint256 i = offset; i < end; i++) page[i - offset] = launches[i];
    }

    function progressBps(uint256 launchId) external view returns (uint256) {
        Launch storage launch = _launchView(launchId);
        if (launch.nativeReserve >= graduationTarget || launch.tokenReserve == 0) return BPS;
        return (launch.nativeReserve * BPS) / graduationTarget;
    }

    function setTreasury(address treasury_) external onlyAdmin {
        if (treasury_ == address(0)) revert InvalidAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setGraduationTarget(uint256 target_) external onlyAdmin {
        if (target_ == 0) revert InvalidParameter();
        graduationTarget = target_;
        emit GraduationTargetUpdated(target_);
    }

    function setPaused(bool paused_) external onlyAdmin {
        paused = paused_;
        emit PausedUpdated(paused_);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert InvalidAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    function _quoteBuy(Launch storage launch, uint256 nativeIn) internal view returns (uint256) {
        if (nativeIn == 0) return 0;
        uint256 invariant = launch.virtualNativeReserve * launch.virtualTokenReserve;
        uint256 nextVirtualToken = invariant / (launch.virtualNativeReserve + nativeIn);
        return launch.virtualTokenReserve - nextVirtualToken;
    }

    function _quoteSell(Launch storage launch, uint256 tokenIn) internal view returns (uint256) {
        if (tokenIn == 0) return 0;
        uint256 invariant = launch.virtualNativeReserve * launch.virtualTokenReserve;
        uint256 nextVirtualNative = invariant / (launch.virtualTokenReserve + tokenIn);
        return launch.virtualNativeReserve - nextVirtualNative;
    }

    function _currentPrice(Launch storage launch) internal view returns (uint256) {
        if (launch.virtualTokenReserve == 0) return type(uint256).max;
        return (launch.virtualNativeReserve * 1 ether) / launch.virtualTokenReserve;
    }

    function _graduateIfReady(uint256 launchId, Launch storage launch) internal {
        if (launch.nativeReserve >= graduationTarget || launch.tokenReserve == 0) {
            launch.graduated = true;
            emit Graduated(launchId, launch.token, launch.nativeReserve, launch.tokenReserve, DEX_LIQUIDITY_SUPPLY);
        }
    }

    function _launch(uint256 launchId) internal view returns (Launch storage launch) {
        if (launchId >= launchCount) revert UnknownLaunch();
        launch = launches[launchId];
    }

    function _launchView(uint256 launchId) internal view returns (Launch storage launch) {
        if (launchId >= launchCount) revert UnknownLaunch();
        launch = launches[launchId];
    }

    function _sendNative(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success,) = payable(to).call{value: amount}('');
        if (!success) revert TransferFailed();
    }

    receive() external payable {
        revert InvalidParameter();
    }
}