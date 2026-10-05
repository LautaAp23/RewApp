// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {USDr} from "../src/USDr.sol";
import {RewAppPay} from "../src/RewAppPay.sol";

/// @notice End-to-end payment against a deployment, sent by the relayer (deployer key):
/// a smoke-test merchant sets a 10% cashback rule over USD 5 via a signed RuleIntent, a payer with
/// 0 MON receives 20 USDr and pays USD 10 with a PaymentIntent + permit. Emits PaymentSettled.
/// The payer and merchant keys are deterministic test keys: never use them outside the testnet.
///
/// forge script script/SmokePay.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract SmokePay is Script {
    uint256 internal constant USD = 1e6;

    function run() external {
        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);
        USDr usdr = USDr(vm.parseJsonAddress(json, ".USDr"));
        RewAppPay pay = RewAppPay(vm.parseJsonAddress(json, ".RewAppPay"));

        uint256 payerKey = uint256(keccak256("rewapp.smoke.payer"));
        uint256 merchantKey = uint256(keccak256("rewapp.smoke.merchant"));
        address payer = vm.addr(payerKey);
        address merchant = vm.addr(merchantKey);
        uint256 amount = 10 * USD;
        uint256 deadline = block.timestamp + 10 minutes;

        vm.startBroadcast();
        if (!pay.isMerchant(merchant)) pay.registerMerchant(merchant);

        RewAppPay.RuleIntent memory rule = RewAppPay.RuleIntent({
            merchant: merchant,
            ruleType: RewAppPay.RuleType.CASHBACK,
            minAmount: 5 * USD,
            valueBps: 1_000,
            fixedAmount: 0,
            visitsGoal: 0,
            active: true,
            nonce: pay.nonces(merchant),
            deadline: deadline
        });
        pay.setMerchantRuleWithSig(rule, _sign(merchantKey, pay.hashRuleIntent(rule)));

        usdr.mint(payer, 2 * amount);

        RewAppPay.PaymentIntent memory intent = RewAppPay.PaymentIntent({
            payer: payer,
            merchant: merchant,
            amount: amount,
            chargeId: keccak256(abi.encode("smoke", block.timestamp)),
            nonce: pay.nonces(payer),
            deadline: deadline
        });
        bytes memory signature = _sign(payerKey, pay.hashPaymentIntent(intent));
        RewAppPay.PermitData memory permit = _permit(usdr, payerKey, payer, address(pay), amount, deadline);
        uint256 reward = pay.payWithSig(intent, signature, permit);
        vm.stopBroadcast();

        console.log("payer", payer);
        console.log("payer MON balance", payer.balance);
        console.log("merchant", merchant);
        console.log("merchantReward (USDr units)", reward);
        console.log("customerPoints", pay.customerPoints(payer));
        console.log("commercePoints", pay.commercePoints(merchant));
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _permit(USDr usdr, uint256 key, address owner, address spender, uint256 value, uint256 deadline)
        internal
        view
        returns (RewAppPay.PermitData memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner,
                spender,
                value,
                usdr.nonces(owner),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, keccak256(abi.encodePacked("\x19\x01", usdr.DOMAIN_SEPARATOR(), structHash)));
        return RewAppPay.PermitData(value, deadline, v, r, s);
    }
}
