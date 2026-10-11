// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RewAppPay} from "../src/RewAppPay.sol";

/// @notice Redeploys ONLY RewAppPay against an existing USDr, re-seeds the demo merchants, their
/// cashback rules and both reward catalogs. USDr keeps every balance and its ONRAMP_ROLE.
///
/// USDR_ADDRESS=0x... MERCHANTS=0xA,0xB \
///   forge script script/DeployPay.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
///
/// `run` delegates to small helpers on purpose: with every local in one frame the script does not
/// compile ("stack too deep"), and turning on viaIR would change how the whole project compiles,
/// including the contracts already deployed and verified.
contract DeployPay is Script {
    uint256 internal constant USD = 1e6;

    // docs/PLAN.md §8: same working assumptions as the original deploy.
    uint256 internal constant FEE_BPS = 150;
    uint256 internal constant CUSTOMER_POINTS_PER_USD = 10;
    uint256 internal constant COMMERCE_POINTS_PER_USD = 10;
    uint256 internal constant MAX_PAYMENT = 500 * USD;
    uint256 internal constant DAILY_LIMIT = 1_000 * USD;

    // Café Demo keeps the 10% cashback over USD 5 it had before the redeploy.
    uint16 internal constant DEMO_CASHBACK_BPS = 1_000;
    uint256 internal constant DEMO_CASHBACK_MIN = 5 * USD;

    /// Same deterministic testnet key as scripts/demo-charge.mjs and api/dev/charge.
    uint256 internal constant DEMO_KEY = uint256(keccak256(bytes("rewapp.smoke.merchant")));

    function run() external returns (RewAppPay pay) {
        IERC20 usdr = IERC20(vm.envAddress("USDR_ADDRESS"));
        vm.startBroadcast();
        pay = _deploy(usdr);
        _registerAdminMerchants(pay);
        _selfRegisterDemo(pay);
        _setDemoCashback(pay);
        _seedRewards(pay);
        vm.stopBroadcast();
        _writeDeployment(usdr, pay);
        console.log("RewAppPay", address(pay));
    }

    function _deploy(IERC20 usdr) internal returns (RewAppPay) {
        (, address deployer,) = vm.readCallers();
        return new RewAppPay(
            usdr,
            deployer,
            vm.envOr("TREASURY_ADDRESS", deployer),
            FEE_BPS,
            CUSTOMER_POINTS_PER_USD,
            COMMERCE_POINTS_PER_USD,
            MAX_PAYMENT,
            DAILY_LIMIT
        );
    }

    /// MERCHANTS: merchants an admin enables directly (the EUR demo one and any other).
    function _registerAdminMerchants(RewAppPay pay) internal {
        address[] memory merchants = vm.envOr("MERCHANTS", ",", new address[](0));
        for (uint256 i; i < merchants.length; ++i) {
            pay.registerMerchant(merchants[i]);
        }
    }

    /// Café Demo re-registers ITSELF with its own signature, which also exercises the new path.
    function _selfRegisterDemo(RewAppPay pay) internal {
        address demo = vm.addr(DEMO_KEY);
        RewAppPay.MerchantIntent memory intent =
            RewAppPay.MerchantIntent({merchant: demo, nonce: pay.nonces(demo), deadline: block.timestamp + 1 hours});
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(DEMO_KEY, pay.hashMerchantIntent(intent));
        pay.registerMerchantWithSig(intent, abi.encodePacked(r, s, v));
    }

    /// No admin function can set another merchant's rule (setMerchantRule uses msg.sender), so the
    /// cashback is signed by Café Demo too. Runs after the self-registration: the nonce is already 1.
    function _setDemoCashback(RewAppPay pay) internal {
        address demo = vm.addr(DEMO_KEY);
        RewAppPay.RuleIntent memory rule = RewAppPay.RuleIntent({
            merchant: demo,
            ruleType: RewAppPay.RuleType.CASHBACK,
            minAmount: DEMO_CASHBACK_MIN,
            valueBps: DEMO_CASHBACK_BPS,
            fixedAmount: 0,
            visitsGoal: 0,
            active: true,
            nonce: pay.nonces(demo),
            deadline: block.timestamp + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(DEMO_KEY, pay.hashRuleIntent(rule));
        pay.setMerchantRuleWithSig(rule, abi.encodePacked(r, s, v));
    }

    /// Placeholder catalogs (PLAN.md §8). The ids match PlatformReward.id in Postgres.
    function _seedRewards(RewAppPay pay) internal {
        pay.setReward(1, RewAppPay.Audience.CUSTOMER, 300, true);
        pay.setReward(2, RewAppPay.Audience.CUSTOMER, 500, true);
        pay.setReward(3, RewAppPay.Audience.CUSTOMER, 1_000, true);
        pay.setReward(101, RewAppPay.Audience.COMMERCE, 2_000, true);
        pay.setReward(102, RewAppPay.Audience.COMMERCE, 5_000, true);
    }

    function _writeDeployment(IERC20 usdr, RewAppPay pay) internal {
        string memory json = "pay-deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "USDr", address(usdr));
        json = vm.serializeAddress(json, "RewAppPay", address(pay));
        vm.writeJson(json, string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), "-pay.json"));
    }
}
