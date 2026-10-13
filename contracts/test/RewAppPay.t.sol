// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {USDr} from "../src/USDr.sol";
import {RewAppPay} from "../src/RewAppPay.sol";

contract RewAppPayTest is Test {
    USDr internal usdr;
    RewAppPay internal pay;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal relayer = makeAddr("relayer");
    address internal payer;
    uint256 internal payerKey;
    address internal merchant;
    uint256 internal merchantKey;

    uint256 internal constant USD = 1e6;
    uint256 internal constant FEE_BPS = 150;
    uint256 internal constant POINTS_PER_USD = 10;
    uint256 internal constant MAX_PAYMENT = 500 * USD;
    uint256 internal constant DAILY_LIMIT = 1_000 * USD;

    uint256 internal constant CUSTOMER_REWARD = 1;
    uint256 internal constant COMMERCE_REWARD = 2;

    function setUp() public {
        (payer, payerKey) = makeAddrAndKey("payer");
        (merchant, merchantKey) = makeAddrAndKey("merchant");

        // A realistic clock: streak days are counted from the epoch like spentOnDay.
        vm.warp(1_760_000_000);
        usdr = new USDr(admin);
        pay = new RewAppPay(
            usdr, admin, treasury, FEE_BPS, POINTS_PER_USD, POINTS_PER_USD, MAX_PAYMENT, DAILY_LIMIT, true
        );

        vm.startPrank(admin);
        usdr.grantRole(usdr.ONRAMP_ROLE(), admin);
        usdr.mint(payer, 10_000 * USD);
        pay.registerMerchant(merchant);
        pay.setReward(CUSTOMER_REWARD, RewAppPay.Audience.CUSTOMER, 100, true);
        pay.setReward(COMMERCE_REWARD, RewAppPay.Audience.COMMERCE, 100, true);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _intent(uint256 amount, bytes32 chargeId) internal view returns (RewAppPay.PaymentIntent memory) {
        return RewAppPay.PaymentIntent({
            payer: payer,
            merchant: merchant,
            amount: amount,
            chargeId: chargeId,
            nonce: pay.nonces(payer),
            deadline: vm.getBlockTimestamp() + 5 minutes
        });
    }

    function _signPayment(uint256 key, RewAppPay.PaymentIntent memory intent) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, pay.hashPaymentIntent(intent));
        return abi.encodePacked(r, s, v);
    }

    function _permit(uint256 key, address owner, uint256 value) internal view returns (RewAppPay.PermitData memory) {
        uint256 deadline = vm.getBlockTimestamp() + 5 minutes;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner,
                address(pay),
                value,
                usdr.nonces(owner),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, keccak256(abi.encodePacked("\x19\x01", usdr.DOMAIN_SEPARATOR(), structHash)));
        return RewAppPay.PermitData(value, deadline, v, r, s);
    }

    function _noPermit() internal pure returns (RewAppPay.PermitData memory p) {}

    function _pay(uint256 amount, bytes32 chargeId) internal returns (uint256) {
        RewAppPay.PaymentIntent memory intent = _intent(amount, chargeId);
        bytes memory sig = _signPayment(payerKey, intent);
        RewAppPay.PermitData memory permit = _permit(payerKey, payer, amount);
        vm.prank(relayer);
        return pay.payWithSig(intent, sig, permit);
    }

    function _signRedeem(address account, uint256 key, uint256 rewardId)
        internal
        view
        returns (RewAppPay.RedeemIntent memory intent, bytes memory sig)
    {
        intent = RewAppPay.RedeemIntent({
            account: account, rewardId: rewardId, nonce: pay.nonces(account), deadline: block.timestamp + 5 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, pay.hashRedeemIntent(intent));
        sig = abi.encodePacked(r, s, v);
    }

    function _redeem(address account, uint256 key, uint256 rewardId) internal {
        (RewAppPay.RedeemIntent memory intent, bytes memory sig) = _signRedeem(account, key, rewardId);
        vm.prank(relayer);
        pay.redeemWithSig(intent, sig);
    }

    function _expectRedeemRevert(address account, uint256 key, uint256 rewardId, bytes memory err) internal {
        (RewAppPay.RedeemIntent memory intent, bytes memory sig) = _signRedeem(account, key, rewardId);
        vm.expectRevert(err);
        pay.redeemWithSig(intent, sig);
    }

    function _cashback(uint16 bps, uint256 minAmount) internal {
        vm.prank(merchant);
        pay.setMerchantRule(RewAppPay.RuleType.CASHBACK, minAmount, bps, 0, 0, true);
    }

    // ------------------------------------------------------------------
    // payWithSig: split
    // ------------------------------------------------------------------

    function test_PaySplitsWithoutRules() public {
        uint256 amount = 10 * USD;
        vm.expectEmit(true, true, true, true, address(pay));
        emit RewAppPay.PaymentSettled(payer, merchant, "c1", amount, 9.85e6, 0.15e6, 0, 100, 100);
        uint256 reward = _pay(amount, "c1");

        assertEq(reward, 0);
        assertEq(usdr.balanceOf(merchant), 9.85e6);
        assertEq(usdr.balanceOf(treasury), 0.15e6);
        assertEq(usdr.balanceOf(payer), 10_000 * USD - amount);
        assertEq(usdr.balanceOf(address(pay)), 0);
        assertEq(pay.customerPoints(payer), 100);
        assertEq(pay.commercePoints(merchant), 100);
        assertEq(pay.visits(payer, merchant), 1);
        assertTrue(pay.chargeUsed("c1"));
    }

    function testFuzz_SplitSumsExactlyAmount(uint256 amount, uint16 cashbackBps, uint256 bonus, uint32 goal) public {
        amount = bound(amount, 1, MAX_PAYMENT);
        cashbackBps = uint16(bound(cashbackBps, 1, 5_000));
        bonus = bound(bonus, 1, 1_000 * USD);
        goal = uint32(bound(goal, 1, 3));

        vm.startPrank(merchant);
        pay.setMerchantRule(RewAppPay.RuleType.CASHBACK, 0, cashbackBps, 0, 0, true);
        pay.setMerchantRule(RewAppPay.RuleType.VISIT_BONUS, 0, 0, bonus, goal, true);
        vm.stopPrank();

        uint256 payerBefore = usdr.balanceOf(payer);
        vm.recordLogs();
        uint256 reward = _pay(amount, keccak256(abi.encode(amount)));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        Vm.Log memory settled = logs[logs.length - 1];
        (uint256 eventAmount, uint256 merchantNet, uint256 fee, uint256 eventReward,,) =
            abi.decode(settled.data, (uint256, uint256, uint256, uint256, uint256, uint256));

        assertEq(eventAmount, amount);
        assertEq(eventReward, reward);
        assertEq(merchantNet + fee + reward, amount);
        assertEq(usdr.balanceOf(merchant), merchantNet);
        assertEq(usdr.balanceOf(treasury), fee);
        assertEq(payerBefore - usdr.balanceOf(payer), amount - reward);
        assertEq(usdr.balanceOf(address(pay)), 0);
    }

    function test_PayWithExistingAllowanceAndNoPermit() public {
        vm.prank(payer);
        usdr.approve(address(pay), type(uint256).max);
        RewAppPay.PaymentIntent memory intent = _intent(5 * USD, "c1");
        bytes memory sig = _signPayment(payerKey, intent);
        vm.prank(relayer);
        pay.payWithSig(intent, sig, _noPermit());
        assertEq(usdr.balanceOf(treasury), 0.075e6);
    }

    function test_PayStillWorksWhenPermitWasFrontRun() public {
        RewAppPay.PaymentIntent memory intent = _intent(5 * USD, "c1");
        bytes memory sig = _signPayment(payerKey, intent);
        RewAppPay.PermitData memory p = _permit(payerKey, payer, 5 * USD);
        usdr.permit(payer, address(pay), p.value, p.deadline, p.v, p.r, p.s);

        vm.prank(relayer);
        pay.payWithSig(intent, sig, p);
        assertEq(pay.customerPoints(payer), 50);
    }

    // ------------------------------------------------------------------
    // payWithSig: validations
    // ------------------------------------------------------------------

    function test_RevertWhen_Replay() public {
        RewAppPay.PaymentIntent memory intent = _intent(5 * USD, "c1");
        bytes memory sig = _signPayment(payerKey, intent);
        RewAppPay.PermitData memory permit = _permit(payerKey, payer, 10 * USD);
        pay.payWithSig(intent, sig, permit);

        vm.expectRevert(abi.encodeWithSelector(RewAppPay.ChargeAlreadyUsed.selector, bytes32("c1")));
        pay.payWithSig(intent, sig, permit);
    }

    function test_RevertWhen_NonceReusedWithNewCharge() public {
        _pay(5 * USD, "c1");
        RewAppPay.PaymentIntent memory intent = _intent(5 * USD, "c2");
        intent.nonce = 0;
        bytes memory sig = _signPayment(payerKey, intent);
        RewAppPay.PermitData memory permit = _permit(payerKey, payer, 5 * USD);
        vm.expectRevert(abi.encodeWithSelector(Nonces.InvalidAccountNonce.selector, payer, 1));
        pay.payWithSig(intent, sig, permit);
    }

    function test_RevertWhen_ChargeIdRepeated() public {
        _pay(5 * USD, "c1");
        RewAppPay.PaymentIntent memory intent = _intent(5 * USD, "c1");
        bytes memory sig = _signPayment(payerKey, intent);
        RewAppPay.PermitData memory permit = _permit(payerKey, payer, 5 * USD);
        vm.expectRevert(abi.encodeWithSelector(RewAppPay.ChargeAlreadyUsed.selector, bytes32("c1")));
        pay.payWithSig(intent, sig, permit);
    }

    function test_RevertWhen_DeadlineExpired() public {
        RewAppPay.PaymentIntent memory intent = _intent(5 * USD, "c1");
        bytes memory sig = _signPayment(payerKey, intent);
        vm.warp(intent.deadline + 1);
        vm.expectRevert(RewAppPay.Expired.selector);
        pay.payWithSig(intent, sig, _noPermit());
    }

    function test_RevertWhen_SignedByAnotherKey() public {
        (, uint256 otherKey) = makeAddrAndKey("other");
        RewAppPay.PaymentIntent memory intent = _intent(5 * USD, "c1");
        bytes memory sig = _signPayment(otherKey, intent);
        vm.expectRevert(RewAppPay.InvalidSignature.selector);
        pay.payWithSig(intent, sig, _noPermit());
    }

    function test_RevertWhen_IntentTampered() public {
        RewAppPay.PaymentIntent memory intent = _intent(5 * USD, "c1");
        bytes memory sig = _signPayment(payerKey, intent);
        intent.amount = 50 * USD;
        vm.expectRevert(RewAppPay.InvalidSignature.selector);
        pay.payWithSig(intent, sig, _noPermit());
    }

    function test_RevertWhen_OverPaymentLimit() public {
        RewAppPay.PaymentIntent memory intent = _intent(MAX_PAYMENT + 1, "c1");
        bytes memory sig = _signPayment(payerKey, intent);
        vm.expectRevert(abi.encodeWithSelector(RewAppPay.PaymentLimitExceeded.selector, MAX_PAYMENT + 1, MAX_PAYMENT));
        pay.payWithSig(intent, sig, _noPermit());
    }

    function test_RevertWhen_OverDailyLimit() public {
        _pay(MAX_PAYMENT, "c1");
        _pay(MAX_PAYMENT, "c2");
        RewAppPay.PaymentIntent memory intent = _intent(1, "c3");
        bytes memory sig = _signPayment(payerKey, intent);
        RewAppPay.PermitData memory permit = _permit(payerKey, payer, 1);
        vm.expectRevert(abi.encodeWithSelector(RewAppPay.DailyLimitExceeded.selector, DAILY_LIMIT + 1, DAILY_LIMIT));
        pay.payWithSig(intent, sig, permit);
    }

    function test_DailyLimitResetsNextDay() public {
        _pay(MAX_PAYMENT, "c1");
        _pay(MAX_PAYMENT, "c2");
        vm.warp(block.timestamp + 1 days);
        _pay(1, "c3");
        assertEq(pay.visits(payer, merchant), 3);
    }

    function test_RevertWhen_MerchantNotRegistered() public {
        address stranger = makeAddr("stranger");
        RewAppPay.PaymentIntent memory intent = _intent(5 * USD, "c1");
        intent.merchant = stranger;
        bytes memory sig = _signPayment(payerKey, intent);
        vm.expectRevert(abi.encodeWithSelector(RewAppPay.NotMerchant.selector, stranger));
        pay.payWithSig(intent, sig, _noPermit());
    }

    function test_RevertWhen_MerchantUnregistered() public {
        vm.prank(admin);
        pay.unregisterMerchant(merchant);
        RewAppPay.PaymentIntent memory intent = _intent(5 * USD, "c1");
        bytes memory sig = _signPayment(payerKey, intent);
        vm.expectRevert(abi.encodeWithSelector(RewAppPay.NotMerchant.selector, merchant));
        pay.payWithSig(intent, sig, _noPermit());
    }

    function test_RevertWhen_ZeroAmount() public {
        RewAppPay.PaymentIntent memory intent = _intent(0, "c1");
        bytes memory sig = _signPayment(payerKey, intent);
        vm.expectRevert(RewAppPay.InvalidAmount.selector);
        pay.payWithSig(intent, sig, _noPermit());
    }

    // ------------------------------------------------------------------
    // Merchant rules (T7, T7b)
    // ------------------------------------------------------------------

    function test_T7_CashbackWithMinimum() public {
        _cashback(1_000, 5 * USD);

        assertEq(_pay(10 * USD, "c1"), 1 * USD);
        assertEq(_pay(4 * USD, "c2"), 0);
        assertEq(pay.customerPoints(payer), 140);
        assertEq(pay.commercePoints(merchant), 140);
    }

    function test_T7b_RuleChangeAppliesToNextPayment() public {
        _cashback(1_000, 5 * USD);
        assertEq(_pay(10 * USD, "c1"), 1 * USD);

        _cashback(500, 0);
        assertEq(_pay(10 * USD, "c2"), 0.5e6);

        vm.prank(merchant);
        pay.setMerchantRule(RewAppPay.RuleType.CASHBACK, 0, 500, 0, 0, false);
        assertEq(_pay(10 * USD, "c3"), 0);
    }

    function test_VisitBonusFixedOnEveryNthVisit() public {
        vm.prank(merchant);
        pay.setMerchantRule(RewAppPay.RuleType.VISIT_BONUS, 0, 0, 2 * USD, 3, true);

        assertEq(_pay(5 * USD, "c1"), 0);
        assertEq(_pay(5 * USD, "c2"), 0);
        assertEq(_pay(5 * USD, "c3"), 2 * USD);
        assertEq(_pay(5 * USD, "c4"), 0);
        assertEq(_pay(5 * USD, "c5"), 0);
        assertEq(_pay(5 * USD, "c6"), 2 * USD);
        assertEq(pay.visits(payer, merchant), 6);
    }

    function test_VisitBonusPercentage() public {
        vm.prank(merchant);
        pay.setMerchantRule(RewAppPay.RuleType.VISIT_BONUS, 0, 2_000, 0, 2, true);
        assertEq(_pay(10 * USD, "c1"), 0);
        assertEq(_pay(10 * USD, "c2"), 2 * USD);
    }

    function test_CashbackAndVisitBonusStack() public {
        vm.startPrank(merchant);
        pay.setMerchantRule(RewAppPay.RuleType.CASHBACK, 0, 1_000, 0, 0, true);
        pay.setMerchantRule(RewAppPay.RuleType.VISIT_BONUS, 0, 0, 1 * USD, 1, true);
        vm.stopPrank();
        assertEq(_pay(10 * USD, "c1"), 2 * USD);
        assertEq(pay.previewMerchantReward(merchant, 10 * USD, 2), 2 * USD);
    }

    function test_RewardIsCappedAtMerchantNet() public {
        vm.prank(merchant);
        pay.setMerchantRule(RewAppPay.RuleType.VISIT_BONUS, 0, 0, 100 * USD, 1, true);
        assertEq(_pay(10 * USD, "c1"), 9.85e6);
        assertEq(usdr.balanceOf(merchant), 0);
        assertEq(usdr.balanceOf(treasury), 0.15e6);
    }

    function test_RevertWhen_NonMerchantSetsRule() public {
        address stranger = makeAddr("stranger");
        vm.expectRevert(abi.encodeWithSelector(RewAppPay.NotMerchant.selector, stranger));
        vm.prank(stranger);
        pay.setMerchantRule(RewAppPay.RuleType.CASHBACK, 0, 1_000, 0, 0, true);
    }

    function test_OtherMerchantCannotChangeForeignRules() public {
        address other = makeAddr("otherMerchant");
        vm.prank(admin);
        pay.registerMerchant(other);
        _cashback(1_000, 0);

        vm.prank(other);
        pay.setMerchantRule(RewAppPay.RuleType.CASHBACK, 0, 5_000, 0, 0, true);

        (,, uint16 bps,,) = pay.rules(merchant, RewAppPay.RuleType.CASHBACK);
        assertEq(bps, 1_000);
        assertEq(_pay(10 * USD, "c1"), 1 * USD);
    }

    function test_RevertWhen_RuleInvalid() public {
        vm.startPrank(merchant);
        vm.expectRevert(RewAppPay.InvalidRule.selector);
        pay.setMerchantRule(RewAppPay.RuleType.CASHBACK, 0, 5_001, 0, 0, true);
        vm.expectRevert(RewAppPay.InvalidRule.selector);
        pay.setMerchantRule(RewAppPay.RuleType.CASHBACK, 0, 0, 0, 0, true);
        vm.expectRevert(RewAppPay.InvalidRule.selector);
        pay.setMerchantRule(RewAppPay.RuleType.CASHBACK, 0, 100, 1, 0, true);
        vm.expectRevert(RewAppPay.InvalidRule.selector);
        pay.setMerchantRule(RewAppPay.RuleType.VISIT_BONUS, 0, 0, 1 * USD, 0, true);
        vm.expectRevert(RewAppPay.InvalidRule.selector);
        pay.setMerchantRule(RewAppPay.RuleType.VISIT_BONUS, 0, 100, 1 * USD, 3, true);
        vm.expectRevert(RewAppPay.InvalidRule.selector);
        pay.setMerchantRule(RewAppPay.RuleType.VISIT_BONUS, 0, 0, 0, 3, true);
        vm.stopPrank();
    }

    function test_SetMerchantRuleWithSig() public {
        RewAppPay.RuleIntent memory intent = RewAppPay.RuleIntent({
            merchant: merchant,
            ruleType: RewAppPay.RuleType.CASHBACK,
            minAmount: 5 * USD,
            valueBps: 1_000,
            fixedAmount: 0,
            visitsGoal: 0,
            active: true,
            nonce: pay.nonces(merchant),
            deadline: block.timestamp + 5 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(merchantKey, pay.hashRuleIntent(intent));
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(relayer);
        pay.setMerchantRuleWithSig(intent, sig);
        assertEq(_pay(10 * USD, "c1"), 1 * USD);

        vm.expectRevert(abi.encodeWithSelector(Nonces.InvalidAccountNonce.selector, merchant, 1));
        pay.setMerchantRuleWithSig(intent, sig);
    }

    function test_RevertWhen_RuleIntentSignedByOther() public {
        RewAppPay.RuleIntent memory intent = RewAppPay.RuleIntent({
            merchant: merchant,
            ruleType: RewAppPay.RuleType.CASHBACK,
            minAmount: 0,
            valueBps: 5_000,
            fixedAmount: 0,
            visitsGoal: 0,
            active: true,
            nonce: 0,
            deadline: block.timestamp + 5 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, pay.hashRuleIntent(intent));
        vm.expectRevert(RewAppPay.InvalidSignature.selector);
        pay.setMerchantRuleWithSig(intent, abi.encodePacked(r, s, v));
    }

    // ------------------------------------------------------------------
    // RewPoints and redemption
    // ------------------------------------------------------------------

    function test_PointsAreCreditedPerUsd() public {
        _pay(3.5e6, "c1");
        assertEq(pay.customerPoints(payer), 35);
        assertEq(pay.commercePoints(merchant), 35);
    }

    function test_PointsRatesAreConfigurable() public {
        vm.prank(admin);
        pay.setPointsRates(20, 5);
        _pay(10 * USD, "c1");
        assertEq(pay.customerPoints(payer), 200);
        assertEq(pay.commercePoints(merchant), 50);
    }

    function test_CustomerRedeemsCustomerReward() public {
        _pay(15 * USD, "c1");
        vm.expectEmit(true, true, false, true, address(pay));
        emit RewAppPay.RewardRedeemed(payer, CUSTOMER_REWARD, RewAppPay.Audience.CUSTOMER, 100);
        _redeem(payer, payerKey, CUSTOMER_REWARD);
        assertEq(pay.customerPoints(payer), 50);
        assertEq(pay.commercePoints(merchant), 150);
    }

    function test_MerchantRedeemsCommerceReward() public {
        _pay(15 * USD, "c1");
        _redeem(merchant, merchantKey, COMMERCE_REWARD);
        assertEq(pay.commercePoints(merchant), 50);
        assertEq(pay.customerPoints(payer), 150);
    }

    function test_RevertWhen_MerchantRedeemsCustomerReward() public {
        _pay(15 * USD, "c1");
        _expectRedeemRevert(
            merchant,
            merchantKey,
            CUSTOMER_REWARD,
            abi.encodeWithSelector(RewAppPay.WrongAudience.selector, CUSTOMER_REWARD)
        );
    }

    function test_RevertWhen_CustomerRedeemsCommerceReward() public {
        _pay(15 * USD, "c1");
        _expectRedeemRevert(
            payer, payerKey, COMMERCE_REWARD, abi.encodeWithSelector(RewAppPay.WrongAudience.selector, COMMERCE_REWARD)
        );
    }

    function test_RevertWhen_InsufficientPoints() public {
        _pay(5 * USD, "c1");
        _expectRedeemRevert(
            payer, payerKey, CUSTOMER_REWARD, abi.encodeWithSelector(RewAppPay.InsufficientPoints.selector, 50, 100)
        );
    }

    function test_RevertWhen_RedeemReplayed() public {
        _pay(50 * USD, "c1");
        RewAppPay.RedeemIntent memory intent = RewAppPay.RedeemIntent({
            account: payer, rewardId: CUSTOMER_REWARD, nonce: pay.nonces(payer), deadline: block.timestamp + 5 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, pay.hashRedeemIntent(intent));
        bytes memory sig = abi.encodePacked(r, s, v);
        pay.redeemWithSig(intent, sig);

        vm.expectRevert(abi.encodeWithSelector(Nonces.InvalidAccountNonce.selector, payer, 2));
        pay.redeemWithSig(intent, sig);
        assertEq(pay.customerPoints(payer), 400);
    }

    function test_RevertWhen_RewardInactiveOrUnknown() public {
        _pay(50 * USD, "c1");
        vm.prank(admin);
        pay.setReward(CUSTOMER_REWARD, RewAppPay.Audience.CUSTOMER, 100, false);
        _expectRedeemRevert(
            payer,
            payerKey,
            CUSTOMER_REWARD,
            abi.encodeWithSelector(RewAppPay.RewardUnavailable.selector, CUSTOMER_REWARD)
        );
        _expectRedeemRevert(payer, payerKey, 99, abi.encodeWithSelector(RewAppPay.RewardUnavailable.selector, 99));
    }

    function test_RevertWhen_RedeemExpired() public {
        RewAppPay.RedeemIntent memory intent =
            RewAppPay.RedeemIntent({account: payer, rewardId: CUSTOMER_REWARD, nonce: 0, deadline: block.timestamp});
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, pay.hashRedeemIntent(intent));
        vm.warp(block.timestamp + 1);
        vm.expectRevert(RewAppPay.Expired.selector);
        pay.redeemWithSig(intent, abi.encodePacked(r, s, v));
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function test_RevertWhen_NonAdminCallsAdminFunctions() public {
        address stranger = makeAddr("stranger");
        bytes memory err = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, pay.DEFAULT_ADMIN_ROLE()
        );
        vm.startPrank(stranger);
        vm.expectRevert(err);
        pay.registerMerchant(stranger);
        vm.expectRevert(err);
        pay.setReward(3, RewAppPay.Audience.CUSTOMER, 1, true);
        vm.expectRevert(err);
        pay.setFee(0);
        vm.expectRevert(err);
        pay.setPointsRates(1, 1);
        vm.expectRevert(err);
        pay.setLimits(1, 1);
        vm.expectRevert(err);
        pay.setTreasury(stranger);
        vm.stopPrank();
    }

    function test_RevertWhen_FeeTooHigh() public {
        vm.expectRevert(RewAppPay.InvalidFee.selector);
        vm.prank(admin);
        pay.setFee(1_001);
    }

    function test_PointsCannotBeTransferred() public view {
        // RewPoints are plain balances: the contract exposes no transfer function for them.
        (bool ok,) = address(pay).staticcall(abi.encodeWithSignature("transfer(address,uint256)", merchant, 1));
        assertFalse(ok);
    }

    // ------------------------------------------------------------------
    // Alta de comercio firmada por el propio comercio
    // ------------------------------------------------------------------

    function _merchantIntent(address who) internal view returns (RewAppPay.MerchantIntent memory) {
        return RewAppPay.MerchantIntent({merchant: who, nonce: pay.nonces(who), deadline: block.timestamp + 5 minutes});
    }

    function test_RegisterMerchantWithSig() public {
        (address newMerchant, uint256 newKey) = makeAddrAndKey("newMerchant");
        RewAppPay.MerchantIntent memory intent = _merchantIntent(newMerchant);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newKey, pay.hashMerchantIntent(intent));

        assertFalse(pay.isMerchant(newMerchant));
        vm.prank(relayer);
        pay.registerMerchantWithSig(intent, abi.encodePacked(r, s, v));
        assertTrue(pay.isMerchant(newMerchant));
    }

    function test_RegisteredMerchantCanBePaid() public {
        (address newMerchant, uint256 newKey) = makeAddrAndKey("newMerchant");
        RewAppPay.MerchantIntent memory intent = _merchantIntent(newMerchant);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newKey, pay.hashMerchantIntent(intent));
        vm.prank(relayer);
        pay.registerMerchantWithSig(intent, abi.encodePacked(r, s, v));

        RewAppPay.PaymentIntent memory payment = RewAppPay.PaymentIntent({
            payer: payer,
            merchant: newMerchant,
            amount: 10 * USD,
            chargeId: "m1",
            nonce: pay.nonces(payer),
            deadline: block.timestamp + 5 minutes
        });
        vm.prank(relayer);
        pay.payWithSig(payment, _signPayment(payerKey, payment), _permit(payerKey, payer, 10 * USD));
        assertGt(pay.commercePoints(newMerchant), 0);
    }

    function test_RevertWhen_MerchantIntentSignedByOther() public {
        (address newMerchant,) = makeAddrAndKey("newMerchant");
        RewAppPay.MerchantIntent memory intent = _merchantIntent(newMerchant);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, pay.hashMerchantIntent(intent));
        vm.expectRevert(RewAppPay.InvalidSignature.selector);
        pay.registerMerchantWithSig(intent, abi.encodePacked(r, s, v));
    }

    function test_RevertWhen_MerchantIntentExpired() public {
        (address newMerchant, uint256 newKey) = makeAddrAndKey("newMerchant");
        RewAppPay.MerchantIntent memory intent = _merchantIntent(newMerchant);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newKey, pay.hashMerchantIntent(intent));
        vm.warp(intent.deadline + 1);
        vm.expectRevert(RewAppPay.Expired.selector);
        pay.registerMerchantWithSig(intent, abi.encodePacked(r, s, v));
    }

    function test_RevertWhen_MerchantIntentReplayed() public {
        (address newMerchant, uint256 newKey) = makeAddrAndKey("newMerchant");
        RewAppPay.MerchantIntent memory intent = _merchantIntent(newMerchant);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newKey, pay.hashMerchantIntent(intent));
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(relayer);
        pay.registerMerchantWithSig(intent, sig);
        vm.expectRevert(abi.encodeWithSelector(Nonces.InvalidAccountNonce.selector, newMerchant, 1));
        pay.registerMerchantWithSig(intent, sig);
    }

    function test_UnregisterMerchantStaysAdminOnly() public {
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, bytes32(0))
        );
        pay.unregisterMerchant(merchant);

        vm.prank(admin);
        pay.unregisterMerchant(merchant);
        assertFalse(pay.isMerchant(merchant));
    }

    // ------------------------------------------------------------------
    // Racha y pozo
    // ------------------------------------------------------------------

    uint256 internal chargeCounter;

    function _today() internal view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }

    function _payStreak(uint256 amount) internal {
        _pay(amount, keccak256(abi.encode("streak", ++chargeCounter)));
    }

    function _nextDays(uint256 n) internal {
        skip(n * 1 days);
    }

    function _cycleDay() internal view returns (uint8 cycleDay) {
        (, cycleDay,) = pay.streaks(payer);
    }

    function _assertStreak(uint8 cycleDay, uint256 pot, bool claimable) internal view {
        (uint8 day,,, uint256 viewPot, bool viewClaimable) = pay.streakOf(payer);
        assertEq(day, cycleDay, "cycleDay");
        assertEq(viewPot, pot, "pot");
        assertEq(viewClaimable, claimable, "claimable");
    }

    /// Days 1..n on consecutive UTC days, one qualifying payment each.
    function _buildStreak(uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            if (i != 0) _nextDays(1);
            _payStreak(1 * USD);
        }
    }

    function _signClaim(address account, uint256 key)
        internal
        view
        returns (RewAppPay.StreakClaimIntent memory intent, bytes memory sig)
    {
        intent = RewAppPay.StreakClaimIntent({
            account: account, nonce: pay.nonces(account), deadline: block.timestamp + 5 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, pay.hashStreakClaimIntent(intent));
        sig = abi.encodePacked(r, s, v);
    }

    function _claim() internal {
        (RewAppPay.StreakClaimIntent memory intent, bytes memory sig) = _signClaim(payer, payerKey);
        vm.prank(relayer);
        pay.claimStreakWithSig(intent, sig);
    }

    function test_StreakStartsOnFirstQualifyingPayment() public {
        vm.expectEmit(true, false, false, true, address(pay));
        emit RewAppPay.StreakAdvanced(payer, 1, _today(), 5, true);
        _payStreak(1 * USD);

        (uint64 lastDay, uint8 cycleDay, bool claimed) = pay.streaks(payer);
        assertEq(cycleDay, 1);
        assertEq(lastDay, _today());
        assertFalse(claimed);
        _assertStreak(1, 5, false);
    }

    function test_StreakSameDayDoesNotMove() public {
        _payStreak(1 * USD);
        _payStreak(20 * USD);
        _assertStreak(1, 5, false);
        assertEq(pay.customerPoints(payer), 210);
    }

    function test_StreakIgnoresPaymentsBelowMinimum() public {
        _payStreak(0.99e6);
        _assertStreak(0, 0, false);
        assertEq(pay.customerPoints(payer), 9);

        _payStreak(1 * USD);
        _assertStreak(1, 5, false);
    }

    function test_StreakBelowMinimumDoesNotAdvanceNextDay() public {
        _payStreak(1 * USD);
        _nextDays(1);
        _payStreak(0.5e6);
        _assertStreak(1, 5, false);
    }

    function test_StreakAdvancesOnConsecutiveDaysUpTo110() public {
        uint256[5] memory pots = [uint256(5), 15, 35, 60, 110];
        for (uint8 i; i < 5; ++i) {
            if (i != 0) _nextDays(1);
            _payStreak(1 * USD);
            _assertStreak(i + 1, pots[i], i == 4);
        }
        assertEq(pay.customerPoints(payer), 50);
    }

    function test_StreakRescuedAfterTwoDays() public {
        _buildStreak(2);
        _nextDays(2);
        _assertStreak(2, 15, false);
        _payStreak(1 * USD);
        _assertStreak(3, 35, false);
    }

    function test_StreakRescuedAfterThreeDays() public {
        _buildStreak(3);
        _nextDays(3);
        _assertStreak(3, 35, false);
        vm.expectEmit(true, false, false, true, address(pay));
        emit RewAppPay.StreakAdvanced(payer, 4, _today(), 60, false);
        _payStreak(1 * USD);
        _assertStreak(4, 60, false);
    }

    function test_StreakBreaksAfterFourDays() public {
        _buildStreak(4);
        _nextDays(4);
        _assertStreak(4, 0, false);
        vm.expectEmit(true, false, false, true, address(pay));
        emit RewAppPay.StreakAdvanced(payer, 1, _today(), 5, true);
        _payStreak(1 * USD);
        _assertStreak(1, 5, false);
    }

    function testFuzz_StreakGapRule(uint8 startDay, uint256 gap) public {
        startDay = uint8(bound(startDay, 1, 4));
        gap = bound(gap, 0, 60);
        _buildStreak(startDay);
        _nextDays(gap);
        _payStreak(1 * USD);

        uint8 expected = gap == 0 ? startDay : (gap >= 4 ? 1 : startDay + 1);
        assertEq(_cycleDay(), expected);
    }

    function test_StreakPausedWhilePotUnclaimed() public {
        _buildStreak(5);
        _nextDays(1);
        _payStreak(10 * USD);
        _nextDays(9);
        _payStreak(10 * USD);

        _assertStreak(5, 110, true);
        assertEq(pay.customerPoints(payer), 50 + 200);
    }

    function test_ClaimCreditsPotOnce() public {
        _buildStreak(5);
        uint256 before = pay.customerPoints(payer);

        vm.expectEmit(true, false, false, true, address(pay));
        emit RewAppPay.StreakClaimed(payer, 110);
        _claim();

        assertEq(pay.customerPoints(payer), before + 110);
        _assertStreak(5, 0, false);
        (,, bool claimed) = pay.streaks(payer);
        assertTrue(claimed);

        (RewAppPay.StreakClaimIntent memory intent, bytes memory sig) = _signClaim(payer, payerKey);
        vm.expectRevert(abi.encodeWithSelector(RewAppPay.StreakNotClaimable.selector, payer));
        pay.claimStreakWithSig(intent, sig);
        assertEq(pay.customerPoints(payer), before + 110);
    }

    function test_ClaimCanWaitAnyTime() public {
        _buildStreak(5);
        _nextDays(90);
        _assertStreak(5, 110, true);
        _claim();
        assertEq(pay.customerPoints(payer), 50 + 110);
    }

    function test_NewCycleStartsAfterClaim() public {
        _buildStreak(5);
        _claim();

        _payStreak(1 * USD);
        assertEq(_cycleDay(), 5, "same day keeps the claimed cycle");

        _nextDays(1);
        vm.expectEmit(true, false, false, true, address(pay));
        emit RewAppPay.StreakAdvanced(payer, 1, _today(), 5, true);
        _payStreak(1 * USD);
        _assertStreak(1, 5, false);
        (,, bool claimed) = pay.streaks(payer);
        assertFalse(claimed);
    }

    function test_RevertWhen_ClaimBeforeDayFive() public {
        _buildStreak(4);
        (RewAppPay.StreakClaimIntent memory intent, bytes memory sig) = _signClaim(payer, payerKey);
        vm.expectRevert(abi.encodeWithSelector(RewAppPay.StreakNotClaimable.selector, payer));
        pay.claimStreakWithSig(intent, sig);
    }

    function test_RevertWhen_ClaimSignedByOther() public {
        _buildStreak(5);
        (, uint256 otherKey) = makeAddrAndKey("other");
        RewAppPay.StreakClaimIntent memory intent = RewAppPay.StreakClaimIntent({
            account: payer, nonce: pay.nonces(payer), deadline: block.timestamp + 5 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(otherKey, pay.hashStreakClaimIntent(intent));
        vm.expectRevert(RewAppPay.InvalidSignature.selector);
        pay.claimStreakWithSig(intent, abi.encodePacked(r, s, v));
    }

    function test_RevertWhen_ClaimExpired() public {
        _buildStreak(5);
        (RewAppPay.StreakClaimIntent memory intent, bytes memory sig) = _signClaim(payer, payerKey);
        vm.warp(intent.deadline + 1);
        vm.expectRevert(RewAppPay.Expired.selector);
        pay.claimStreakWithSig(intent, sig);
    }

    function test_ClaimSharesSequentialNonce() public {
        _buildStreak(5);
        uint256 nonce = pay.nonces(payer);
        _claim();
        assertEq(pay.nonces(payer), nonce + 1);
    }

    function test_StreakPotAt() public view {
        assertEq(pay.streakPotAt(0), 0);
        assertEq(pay.streakPotAt(1), 5);
        assertEq(pay.streakPotAt(2), 15);
        assertEq(pay.streakPotAt(3), 35);
        assertEq(pay.streakPotAt(4), 60);
        assertEq(pay.streakPotAt(5), 110);
    }

    // ------------------------------------------------------------------
    // Sembrado de racha para demo
    // ------------------------------------------------------------------

    function test_SeedAlmostCompleteThenRealPaymentCompletes() public {
        uint256 points = pay.customerPoints(payer);
        vm.expectEmit(true, false, false, true, address(pay));
        emit RewAppPay.StreakSeeded(payer, 4, _today() - 1);
        vm.prank(admin);
        pay.seedStreakForDemo(payer, 4, _today() - 1);

        assertEq(pay.customerPoints(payer), points);
        _assertStreak(4, 60, false);

        _payStreak(1 * USD);
        _assertStreak(5, 110, true);
        _claim();
        assertEq(pay.customerPoints(payer), 10 + 110);
    }

    function test_SeedAtRiskIsRescued() public {
        vm.prank(admin);
        pay.seedStreakForDemo(payer, 3, _today() - 3);
        _assertStreak(3, 35, false);
        _payStreak(1 * USD);
        _assertStreak(4, 60, false);
    }

    function test_SeedResetsClaimedFlag() public {
        _buildStreak(5);
        _claim();
        vm.prank(admin);
        pay.seedStreakForDemo(payer, 5, _today());
        _assertStreak(5, 110, true);
    }

    function test_RevertWhen_SeedByNonAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, pay.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(relayer);
        pay.seedStreakForDemo(payer, 4, _today());
    }

    function test_RevertWhen_SeedInvalid() public {
        vm.startPrank(admin);
        vm.expectRevert(RewAppPay.InvalidStreak.selector);
        pay.seedStreakForDemo(payer, 6, _today());
        vm.expectRevert(RewAppPay.InvalidStreak.selector);
        pay.seedStreakForDemo(payer, 4, _today() + 1);
        vm.expectRevert(RewAppPay.InvalidAddress.selector);
        pay.seedStreakForDemo(address(0), 4, _today());
        vm.stopPrank();
    }

    function test_RevertWhen_SeedWithTestingDisabled() public {
        RewAppPay live = new RewAppPay(
            usdr, admin, treasury, FEE_BPS, POINTS_PER_USD, POINTS_PER_USD, MAX_PAYMENT, DAILY_LIMIT, false
        );
        assertFalse(live.testingEnabled());
        vm.expectRevert(RewAppPay.TestingDisabled.selector);
        vm.prank(admin);
        live.seedStreakForDemo(payer, 4, _today());
        (uint64 lastDay, uint8 cycleDay,) = live.streaks(payer);
        assertEq(cycleDay, 0);
        assertEq(lastDay, 0);
    }

    function testFuzz_SeedNeverCreditsPoints(uint8 cycleDay, uint64 back) public {
        cycleDay = uint8(bound(cycleDay, 0, 5));
        back = uint64(bound(back, 0, 30));
        _payStreak(7 * USD);
        uint256 points = pay.customerPoints(payer);
        vm.prank(admin);
        pay.seedStreakForDemo(payer, cycleDay, _today() - back);
        assertEq(pay.customerPoints(payer), points);
        assertEq(usdr.balanceOf(payer), 10_000 * USD - 7 * USD);
    }
}
