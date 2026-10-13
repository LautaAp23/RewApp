// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/// @title RewAppPay
/// @notice Settles RewApp payments in one transaction: pulls USDr from the payer, applies the merchant's
/// reward rules, splits the amount between merchant, platform and payer, and credits the two
/// non-transferable point balances (RewPoints Customer and RewPoints Commerce).
/// @dev Every user action arrives as an EIP-712 intent signed by the account and submitted by the relayer,
/// so accounts never need MON. Intents of the same account share one sequential nonce.
contract RewAppPay is AccessControl, EIP712, Nonces {
    using SafeERC20 for IERC20;

    enum RuleType {
        CASHBACK,
        VISIT_BONUS
    }

    enum Audience {
        CUSTOMER,
        COMMERCE
    }

    struct Rule {
        uint256 minAmount;
        uint256 fixedAmount;
        uint16 valueBps;
        uint32 visitsGoal;
        bool active;
    }

    struct Reward {
        uint256 pointsCost;
        Audience audience;
        bool active;
        bool exists;
    }

    struct PaymentIntent {
        address payer;
        address merchant;
        uint256 amount;
        bytes32 chargeId;
        uint256 nonce;
        uint256 deadline;
    }

    struct RedeemIntent {
        address account;
        uint256 rewardId;
        uint256 nonce;
        uint256 deadline;
    }

    struct RuleIntent {
        address merchant;
        RuleType ruleType;
        uint256 minAmount;
        uint16 valueBps;
        uint256 fixedAmount;
        uint32 visitsGoal;
        bool active;
        uint256 nonce;
        uint256 deadline;
    }

    /// @notice Self-registration of a merchant, signed by the merchant itself and relayed.
    struct MerchantIntent {
        address merchant;
        uint256 nonce;
        uint256 deadline;
    }

    /// @notice Claim of the completed streak pot, signed by the account and relayed.
    struct StreakClaimIntent {
        address account;
        uint256 nonce;
        uint256 deadline;
    }

    /// @notice Global payment streak of an account (docs/MODEL.md §5, "Constancia").
    /// @dev The pot is not stored: it is a pure function of `cycleDay` (see `streakPotAt`).
    struct Streak {
        uint64 lastDay;
        uint8 cycleDay;
        bool claimed;
    }

    /// @notice EIP-2612 permit for USDr, signed by the payer. Skipped when `deadline` is 0.
    struct PermitData {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    bytes32 public constant PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(address payer,address merchant,uint256 amount,bytes32 chargeId,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant REDEEM_INTENT_TYPEHASH =
        keccak256("RedeemIntent(address account,uint256 rewardId,uint256 nonce,uint256 deadline)");
    bytes32 public constant RULE_INTENT_TYPEHASH = keccak256(
        "RuleIntent(address merchant,uint8 ruleType,uint256 minAmount,uint16 valueBps,uint256 fixedAmount,uint32 visitsGoal,bool active,uint256 nonce,uint256 deadline)"
    );

    bytes32 public constant MERCHANT_INTENT_TYPEHASH =
        keccak256("MerchantIntent(address merchant,uint256 nonce,uint256 deadline)");
    bytes32 public constant STREAK_CLAIM_INTENT_TYPEHASH =
        keccak256("StreakClaimIntent(address account,uint256 nonce,uint256 deadline)");

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 1_000;
    uint256 public constant MAX_RULE_BPS = 5_000;
    /// @dev 1 USDr has 6 decimals; point rates are expressed per whole USDr.
    uint256 private constant USD_UNIT = 1e6;

    /// @notice Smallest payment that moves the streak (1 USDr): dust does not farm the pot.
    uint256 public constant MIN_STREAK_AMOUNT = 1e6;
    /// @notice Days in a streak cycle; the pot becomes claimable on the last one.
    uint8 public constant STREAK_DAYS = 5;
    /// @notice Gap (in UTC days) from which the streak breaks and the pot is lost. 2 and 3 rescue.
    uint256 public constant STREAK_BREAK_GAP = 4;

    IERC20 public immutable usdr;
    /// @notice Enables `seedStreakForDemo`. On for testnet, off for any real deployment.
    bool public immutable testingEnabled;

    address public treasury;
    uint256 public feeBps;
    uint256 public customerPointsPerUsd;
    uint256 public commercePointsPerUsd;
    uint256 public maxPaymentAmount;
    uint256 public dailyLimit;

    mapping(address merchant => bool) public isMerchant;
    mapping(address merchant => mapping(RuleType => Rule)) public rules;
    mapping(address user => mapping(address merchant => uint256)) public visits;
    mapping(address user => uint256) public customerPoints;
    mapping(address merchant => uint256) public commercePoints;
    mapping(uint256 rewardId => Reward) public rewards;
    mapping(bytes32 chargeId => bool) public chargeUsed;
    mapping(address user => mapping(uint256 day => uint256)) public spentOnDay;
    mapping(address user => Streak) public streaks;

    event MerchantRegistered(address indexed merchant, bool registered);
    event MerchantRuleSet(
        address indexed merchant,
        RuleType indexed ruleType,
        uint256 minAmount,
        uint16 valueBps,
        uint256 fixedAmount,
        uint32 visitsGoal,
        bool active
    );
    event PaymentSettled(
        address indexed payer,
        address indexed merchant,
        bytes32 indexed chargeId,
        uint256 amount,
        uint256 merchantNet,
        uint256 platformFee,
        uint256 merchantReward,
        uint256 customerPointsEarned,
        uint256 commercePointsEarned
    );
    event RewardSet(uint256 indexed rewardId, Audience audience, uint256 pointsCost, bool active);
    event RewardRedeemed(address indexed account, uint256 indexed rewardId, Audience audience, uint256 pointsCost);
    event FeeSet(uint256 feeBps);
    event TreasurySet(address treasury);
    event PointsRatesSet(uint256 customerPointsPerUsd, uint256 commercePointsPerUsd);
    event LimitsSet(uint256 maxPaymentAmount, uint256 dailyLimit);
    /// @notice The first qualifying payment of a day moved the streak. `restarted` means a new cycle began.
    event StreakAdvanced(address indexed account, uint8 cycleDay, uint64 day, uint256 pot, bool restarted);
    event StreakClaimed(address indexed account, uint256 points);
    /// @notice Demo-only seeding of the counters (never points). Only when `testingEnabled`.
    event StreakSeeded(address indexed account, uint8 cycleDay, uint64 lastDay);

    error Expired();
    error InvalidSignature();
    error InvalidAmount();
    error InvalidAddress();
    error InvalidRule();
    error InvalidFee();
    error NotMerchant(address account);
    error ChargeAlreadyUsed(bytes32 chargeId);
    error PaymentLimitExceeded(uint256 amount, uint256 limit);
    error DailyLimitExceeded(uint256 spent, uint256 limit);
    error RewardUnavailable(uint256 rewardId);
    error WrongAudience(uint256 rewardId);
    error InsufficientPoints(uint256 balance, uint256 cost);
    error StreakNotClaimable(address account);
    error TestingDisabled();
    error InvalidStreak();

    constructor(
        IERC20 usdr_,
        address admin,
        address treasury_,
        uint256 feeBps_,
        uint256 customerPointsPerUsd_,
        uint256 commercePointsPerUsd_,
        uint256 maxPaymentAmount_,
        uint256 dailyLimit_,
        bool testingEnabled_
    ) EIP712("RewAppPay", "1") {
        if (address(usdr_) == address(0) || admin == address(0)) revert InvalidAddress();
        usdr = usdr_;
        testingEnabled = testingEnabled_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _setTreasury(treasury_);
        _setFee(feeBps_);
        _setPointsRates(customerPointsPerUsd_, commercePointsPerUsd_);
        _setLimits(maxPaymentAmount_, dailyLimit_);
    }

    // ---------------------------------------------------------------------
    // Payments
    // ---------------------------------------------------------------------

    function payWithSig(PaymentIntent calldata intent, bytes calldata signature, PermitData calldata permit)
        external
        returns (uint256 merchantReward)
    {
        if (block.timestamp > intent.deadline) revert Expired();
        if (!isMerchant[intent.merchant]) revert NotMerchant(intent.merchant);
        if (intent.payer == intent.merchant) revert InvalidAddress();
        if (intent.amount == 0) revert InvalidAmount();
        if (intent.amount > maxPaymentAmount) revert PaymentLimitExceeded(intent.amount, maxPaymentAmount);
        if (chargeUsed[intent.chargeId]) revert ChargeAlreadyUsed(intent.chargeId);

        _useCheckedNonce(intent.payer, intent.nonce);
        _verify(intent.payer, _hashPayment(intent), signature);

        uint256 day = block.timestamp / 1 days;
        uint256 spent = spentOnDay[intent.payer][day] + intent.amount;
        if (spent > dailyLimit) revert DailyLimitExceeded(spent, dailyLimit);
        spentOnDay[intent.payer][day] = spent;
        chargeUsed[intent.chargeId] = true;
        if (intent.amount >= MIN_STREAK_AMOUNT) _advanceStreak(intent.payer, day);

        if (permit.deadline != 0) {
            // A front-run permit leaves the allowance in place, so a failure here is not fatal.
            try IERC20Permit(address(usdr))
                .permit(intent.payer, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s) {}
                catch {}
        }

        uint256 platformFee = intent.amount * feeBps / BPS;
        uint256 visitCount = ++visits[intent.payer][intent.merchant];
        merchantReward = _merchantReward(intent.merchant, intent.amount, visitCount, intent.amount - platformFee);
        uint256 merchantNet = intent.amount - platformFee - merchantReward;

        uint256 customerPointsEarned = intent.amount * customerPointsPerUsd / USD_UNIT;
        uint256 commercePointsEarned = intent.amount * commercePointsPerUsd / USD_UNIT;
        customerPoints[intent.payer] += customerPointsEarned;
        commercePoints[intent.merchant] += commercePointsEarned;

        usdr.safeTransferFrom(intent.payer, address(this), intent.amount);
        usdr.safeTransfer(intent.merchant, merchantNet);
        if (platformFee != 0) usdr.safeTransfer(treasury, platformFee);
        if (merchantReward != 0) usdr.safeTransfer(intent.payer, merchantReward);

        emit PaymentSettled(
            intent.payer,
            intent.merchant,
            intent.chargeId,
            intent.amount,
            merchantNet,
            platformFee,
            merchantReward,
            customerPointsEarned,
            commercePointsEarned
        );
    }

    /// @notice Reward the merchant's active rules would pay for a payment, without changing state.
    /// @param visitCount Visit number this payment would be (current visits + 1).
    function previewMerchantReward(address merchant, uint256 amount, uint256 visitCount)
        external
        view
        returns (uint256)
    {
        return _merchantReward(merchant, amount, visitCount, amount - amount * feeBps / BPS);
    }

    function _merchantReward(address merchant, uint256 amount, uint256 visitCount, uint256 cap)
        internal
        view
        returns (uint256 reward)
    {
        Rule storage cashback = rules[merchant][RuleType.CASHBACK];
        if (cashback.active && amount >= cashback.minAmount) {
            reward += amount * cashback.valueBps / BPS;
        }

        Rule storage bonus = rules[merchant][RuleType.VISIT_BONUS];
        if (bonus.active && visitCount % bonus.visitsGoal == 0 && amount >= bonus.minAmount) {
            reward += bonus.fixedAmount != 0 ? bonus.fixedAmount : amount * bonus.valueBps / BPS;
        }

        if (reward > cap) reward = cap;
    }

    // ---------------------------------------------------------------------
    // Streak and pot
    // ---------------------------------------------------------------------

    /// @dev Only the first qualifying payment of a UTC day moves the streak. Gap 0 keeps it, 1 advances,
    /// 2-3 rescue with the pot intact, 4+ break it and start over. A complete unclaimed cycle stays paused.
    function _advanceStreak(address account, uint256 day) internal {
        Streak storage s = streaks[account];
        uint8 cycleDay = s.cycleDay;
        if (cycleDay == STREAK_DAYS && !s.claimed) return;
        uint256 gap = day - s.lastDay;
        if (gap == 0 && cycleDay != 0) return;

        bool restarted = cycleDay == STREAK_DAYS || cycleDay == 0 || gap >= STREAK_BREAK_GAP;
        cycleDay = restarted ? 1 : cycleDay + 1;
        // casting to 'uint64' is safe because a day count since the epoch fits for billions of years
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 today = uint64(day);
        streaks[account] = Streak(today, cycleDay, false);
        // Runs before the permit and transfers; the only earlier external call is the ERC-1271 view in _verify.
        // forge-lint: disable-next-line(reentrancy-events)
        emit StreakAdvanced(account, cycleDay, today, streakPotAt(cycleDay), restarted);
    }

    /// @notice Credits the 110-point pot of a complete cycle, once. The next qualifying payment on a new
    /// day starts another cycle.
    function claimStreakWithSig(StreakClaimIntent calldata intent, bytes calldata signature) external {
        // Same deadline check as every other intent; seconds of validator drift do not matter here.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > intent.deadline) revert Expired();
        Streak storage s = streaks[intent.account];
        if (s.cycleDay != STREAK_DAYS || s.claimed) revert StreakNotClaimable(intent.account);

        _useCheckedNonce(intent.account, intent.nonce);
        _verify(intent.account, _hashStreakClaim(intent), signature);

        s.claimed = true;
        uint256 points = streakPotAt(STREAK_DAYS);
        customerPoints[intent.account] += points;
        // The only external call is the ERC-1271 view in _verify, and the flag is set before this line.
        // forge-lint: disable-next-line(reentrancy-events)
        emit StreakClaimed(intent.account, points);
    }

    /// @notice Pot accumulated after `cycleDay` days: contributions 5, 10, 20, 25, 50 (= 110 on day 5).
    function streakPotAt(uint256 cycleDay) public pure returns (uint256) {
        if (cycleDay >= STREAK_DAYS) return 110;
        if (cycleDay == 4) return 60;
        if (cycleDay == 3) return 35;
        if (cycleDay == 2) return 15;
        if (cycleDay == 1) return 5;
        return 0;
    }

    /// @notice Streak of `account` as seen today. `pot` is what the account would keep now: 0 once the
    /// streak is broken or the cycle claimed.
    function streakOf(address account)
        external
        view
        returns (uint8 cycleDay, uint64 lastDay, bool claimed, uint256 pot, bool claimable)
    {
        Streak memory s = streaks[account];
        (cycleDay, lastDay, claimed) = (s.cycleDay, s.lastDay, s.claimed);
        claimable = cycleDay == STREAK_DAYS && !claimed;
        // Day granularity: validator drift of seconds cannot move a whole UTC day in any meaningful way.
        // forge-lint: disable-next-line(block-timestamp)
        bool lost = claimed || (!claimable && block.timestamp / 1 days - lastDay >= STREAK_BREAK_GAP);
        pot = lost ? 0 : streakPotAt(cycleDay);
    }

    /// @notice Demo seeding: writes only the streak counters of `account`, never points. Admin only and
    /// only on deployments built with `testingEnabled`.
    function seedStreakForDemo(address account, uint8 cycleDay, uint64 lastDay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!testingEnabled) revert TestingDisabled();
        if (account == address(0)) revert InvalidAddress();
        // forge-lint: disable-next-line(block-timestamp)
        if (cycleDay > STREAK_DAYS || lastDay > block.timestamp / 1 days) revert InvalidStreak();
        streaks[account] = Streak(lastDay, cycleDay, false);
        emit StreakSeeded(account, cycleDay, lastDay);
    }

    // ---------------------------------------------------------------------
    // Merchant rules
    // ---------------------------------------------------------------------

    function setMerchantRule(
        RuleType ruleType,
        uint256 minAmount,
        uint16 valueBps,
        uint256 fixedAmount,
        uint32 visitsGoal,
        bool active
    ) external {
        _setRule(msg.sender, ruleType, minAmount, valueBps, fixedAmount, visitsGoal, active);
    }

    function setMerchantRuleWithSig(RuleIntent calldata intent, bytes calldata signature) external {
        if (block.timestamp > intent.deadline) revert Expired();
        _useCheckedNonce(intent.merchant, intent.nonce);
        _verify(intent.merchant, _hashRule(intent), signature);
        _setRule(
            intent.merchant,
            intent.ruleType,
            intent.minAmount,
            intent.valueBps,
            intent.fixedAmount,
            intent.visitsGoal,
            intent.active
        );
    }

    /// @notice Registers the signer as a merchant. Open by design (docs/MODEL.md §6): anybody can
    /// enable their own address, nobody can enable someone else's. `unregisterMerchant` stays admin-only.
    function registerMerchantWithSig(MerchantIntent calldata intent, bytes calldata signature) external {
        if (block.timestamp > intent.deadline) revert Expired();
        if (intent.merchant == address(0)) revert InvalidAddress();
        _useCheckedNonce(intent.merchant, intent.nonce);
        _verify(intent.merchant, _hashMerchant(intent), signature);
        isMerchant[intent.merchant] = true;
        emit MerchantRegistered(intent.merchant, true);
    }

    function _setRule(
        address merchant,
        RuleType ruleType,
        uint256 minAmount,
        uint16 valueBps,
        uint256 fixedAmount,
        uint32 visitsGoal,
        bool active
    ) internal {
        if (!isMerchant[merchant]) revert NotMerchant(merchant);
        if (valueBps > MAX_RULE_BPS) revert InvalidRule();
        if (ruleType == RuleType.CASHBACK) {
            if (fixedAmount != 0 || visitsGoal != 0) revert InvalidRule();
            if (active && valueBps == 0) revert InvalidRule();
        } else {
            if (visitsGoal == 0) revert InvalidRule();
            if (active && (fixedAmount == 0) == (valueBps == 0)) revert InvalidRule();
        }
        rules[merchant][ruleType] = Rule(minAmount, fixedAmount, valueBps, visitsGoal, active);
        emit MerchantRuleSet(merchant, ruleType, minAmount, valueBps, fixedAmount, visitsGoal, active);
    }

    // ---------------------------------------------------------------------
    // Points redemption
    // ---------------------------------------------------------------------

    function redeemWithSig(RedeemIntent calldata intent, bytes calldata signature) external {
        if (block.timestamp > intent.deadline) revert Expired();
        Reward memory reward = rewards[intent.rewardId];
        if (!reward.exists || !reward.active) revert RewardUnavailable(intent.rewardId);

        Audience accountAudience = isMerchant[intent.account] ? Audience.COMMERCE : Audience.CUSTOMER;
        if (reward.audience != accountAudience) revert WrongAudience(intent.rewardId);

        _useCheckedNonce(intent.account, intent.nonce);
        _verify(intent.account, _hashRedeem(intent), signature);

        mapping(address => uint256) storage balances =
            reward.audience == Audience.COMMERCE ? commercePoints : customerPoints;
        uint256 balance = balances[intent.account];
        if (balance < reward.pointsCost) revert InsufficientPoints(balance, reward.pointsCost);
        balances[intent.account] = balance - reward.pointsCost;

        emit RewardRedeemed(intent.account, intent.rewardId, reward.audience, reward.pointsCost);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function registerMerchant(address merchant) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (merchant == address(0)) revert InvalidAddress();
        isMerchant[merchant] = true;
        emit MerchantRegistered(merchant, true);
    }

    function unregisterMerchant(address merchant) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isMerchant[merchant] = false;
        emit MerchantRegistered(merchant, false);
    }

    function setReward(uint256 rewardId, Audience audience, uint256 pointsCost, bool active)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (pointsCost == 0) revert InvalidAmount();
        rewards[rewardId] = Reward(pointsCost, audience, active, true);
        emit RewardSet(rewardId, audience, pointsCost, active);
    }

    function setFee(uint256 feeBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setFee(feeBps_);
    }

    function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setTreasury(treasury_);
    }

    function setPointsRates(uint256 customerPointsPerUsd_, uint256 commercePointsPerUsd_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setPointsRates(customerPointsPerUsd_, commercePointsPerUsd_);
    }

    function setLimits(uint256 maxPaymentAmount_, uint256 dailyLimit_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setLimits(maxPaymentAmount_, dailyLimit_);
    }

    function _setFee(uint256 feeBps_) internal {
        if (feeBps_ > MAX_FEE_BPS) revert InvalidFee();
        feeBps = feeBps_;
        emit FeeSet(feeBps_);
    }

    function _setTreasury(address treasury_) internal {
        if (treasury_ == address(0)) revert InvalidAddress();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function _setPointsRates(uint256 customerPointsPerUsd_, uint256 commercePointsPerUsd_) internal {
        customerPointsPerUsd = customerPointsPerUsd_;
        commercePointsPerUsd = commercePointsPerUsd_;
        emit PointsRatesSet(customerPointsPerUsd_, commercePointsPerUsd_);
    }

    function _setLimits(uint256 maxPaymentAmount_, uint256 dailyLimit_) internal {
        if (maxPaymentAmount_ == 0 || dailyLimit_ < maxPaymentAmount_) revert InvalidAmount();
        maxPaymentAmount = maxPaymentAmount_;
        dailyLimit = dailyLimit_;
        emit LimitsSet(maxPaymentAmount_, dailyLimit_);
    }

    // ---------------------------------------------------------------------
    // EIP-712
    // ---------------------------------------------------------------------

    // forge-lint: disable-next-line(mixed-case-function)
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function hashPaymentIntent(PaymentIntent calldata intent) external view returns (bytes32) {
        return _hashPayment(intent);
    }

    function hashRedeemIntent(RedeemIntent calldata intent) external view returns (bytes32) {
        return _hashRedeem(intent);
    }

    function hashRuleIntent(RuleIntent calldata intent) external view returns (bytes32) {
        return _hashRule(intent);
    }

    function hashMerchantIntent(MerchantIntent calldata intent) external view returns (bytes32) {
        return _hashMerchant(intent);
    }

    function hashStreakClaimIntent(StreakClaimIntent calldata intent) external view returns (bytes32) {
        return _hashStreakClaim(intent);
    }

    function _hashStreakClaim(StreakClaimIntent calldata i) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(STREAK_CLAIM_INTENT_TYPEHASH, i.account, i.nonce, i.deadline)));
    }

    function _hashPayment(PaymentIntent calldata i) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(PAYMENT_INTENT_TYPEHASH, i.payer, i.merchant, i.amount, i.chargeId, i.nonce, i.deadline)
            )
        );
    }

    function _hashRedeem(RedeemIntent calldata i) internal view returns (bytes32) {
        return
            _hashTypedDataV4(keccak256(abi.encode(REDEEM_INTENT_TYPEHASH, i.account, i.rewardId, i.nonce, i.deadline)));
    }

    function _hashRule(RuleIntent calldata i) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    RULE_INTENT_TYPEHASH,
                    i.merchant,
                    i.ruleType,
                    i.minAmount,
                    i.valueBps,
                    i.fixedAmount,
                    i.visitsGoal,
                    i.active,
                    i.nonce,
                    i.deadline
                )
            )
        );
    }

    function _hashMerchant(MerchantIntent calldata i) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(MERCHANT_INTENT_TYPEHASH, i.merchant, i.nonce, i.deadline)));
    }

    function _verify(address signer, bytes32 digest, bytes calldata signature) internal view {
        if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) revert InvalidSignature();
    }
}
