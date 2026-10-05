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

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 1_000;
    uint256 public constant MAX_RULE_BPS = 5_000;
    /// @dev 1 USDr has 6 decimals; point rates are expressed per whole USDr.
    uint256 private constant USD_UNIT = 1e6;

    IERC20 public immutable usdr;

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

    constructor(
        IERC20 usdr_,
        address admin,
        address treasury_,
        uint256 feeBps_,
        uint256 customerPointsPerUsd_,
        uint256 commercePointsPerUsd_,
        uint256 maxPaymentAmount_,
        uint256 dailyLimit_
    ) EIP712("RewAppPay", "1") {
        if (address(usdr_) == address(0) || admin == address(0)) revert InvalidAddress();
        usdr = usdr_;
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

    function _verify(address signer, bytes32 digest, bytes calldata signature) internal view {
        if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) revert InvalidSignature();
    }
}
