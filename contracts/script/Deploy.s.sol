// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Zaave} from "../src/Zaave.sol";

/// @notice Deploys Zaave for the current chain (Base 8453 or Base Sepolia 84532).
///   env: OWNER (default: deployer), TVL_CAP (default 50_000e6 = 50k USDC)
///   Writes contracts/deployments/<chainid>.json
contract Deploy is Script {
    // Aave v3 Base (bgd-labs/aave-address-book AaveV3Base): verified with
    // pool.getReserveData(usdc).aTokenAddress == 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB
    address constant BASE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    // Aave v3 Base Sepolia (AaveV3BaseSepolia): aToken == 0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC
    address constant BASE_SEPOLIA_POOL = 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27;
    address constant BASE_SEPOLIA_USDC = 0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f;

    function run() external returns (Zaave z) {
        (address pool, address usdc) = _config(block.chainid);

        vm.startBroadcast();
        address deployer = msg.sender;
        address owner = vm.envOr("OWNER", deployer);
        uint256 cap = vm.envOr("TVL_CAP", uint256(50_000e6));
        z = new Zaave(pool, usdc, owner, cap);
        vm.stopBroadcast();

        console2.log("Zaave deployed:", address(z));
        console2.log("owner:", owner);
        console2.log("aUSDC:", z.AUSDC());

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory key = "deployment";
        vm.serializeAddress(key, "zaave", address(z));
        vm.serializeAddress(key, "pool", pool);
        vm.serializeAddress(key, "usdc", usdc);
        vm.serializeAddress(key, "aUsdc", z.AUSDC());
        vm.serializeAddress(key, "owner", owner);
        vm.serializeUint(key, "tvlCap", cap);
        string memory json = vm.serializeUint(key, "chainId", block.chainid);
        vm.writeJson(json, path);
    }

    function _config(uint256 chainId) internal pure returns (address pool, address usdc) {
        if (chainId == 8453) return (BASE_POOL, BASE_USDC);
        if (chainId == 84532) return (BASE_SEPOLIA_POOL, BASE_SEPOLIA_USDC);
        revert("Deploy: unsupported chain");
    }
}
