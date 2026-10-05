// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {USDr} from "../src/USDr.sol";

contract USDrTest is Test {
    USDr internal usdr;
    address internal admin = makeAddr("admin");
    address internal onramp = makeAddr("onramp");
    address internal spender = makeAddr("spender");

    function setUp() public {
        usdr = new USDr(admin);
        bytes32 role = usdr.ONRAMP_ROLE();
        vm.prank(admin);
        usdr.grantRole(role, onramp);
    }

    function test_Metadata() public view {
        assertEq(usdr.decimals(), 6);
        assertEq(usdr.symbol(), "USDr");
        assertEq(usdr.name(), "RewApp Dollar");
    }

    function test_MintWithRole() public {
        vm.prank(onramp);
        usdr.mint(spender, 10e6);
        assertEq(usdr.balanceOf(spender), 10e6);
    }

    function test_RevertWhen_MintWithoutRole() public {
        bytes32 role = usdr.ONRAMP_ROLE();
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, role));
        vm.prank(admin);
        usdr.mint(admin, 1);
    }

    function testFuzz_RevertWhen_MintWithoutRole(address caller) public {
        vm.assume(caller != onramp);
        vm.expectRevert();
        vm.prank(caller);
        usdr.mint(caller, 1);
    }

    function test_Permit() public {
        (address owner, uint256 key) = makeAddrAndKey("owner");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner,
                spender,
                5e6,
                usdr.nonces(owner),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdr.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);

        usdr.permit(owner, spender, 5e6, deadline, v, r, s);

        assertEq(usdr.allowance(owner, spender), 5e6);
        assertEq(usdr.nonces(owner), 1);
    }
}
