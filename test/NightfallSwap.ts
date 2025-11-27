import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { ContractTransactionReceipt } from "ethers";

import {
  ERC7984ETH,
  ERC7984ETH__factory,
  ERC7984USDT,
  ERC7984USDT__factory,
  NightfallSwap,
  NightfallSwap__factory,
} from "../types";

type FixtureResult = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  eEth: ERC7984ETH;
  eUsdt: ERC7984USDT;
  swap: NightfallSwap;
  swapAddress: string;
};

const BASE_UNIT = 1_000_000n;
const RATE = 3300n;

async function deploySwapFixture(): Promise<FixtureResult> {
  const [deployer, alice, bob] = await ethers.getSigners();

  const eEthFactory = (await ethers.getContractFactory("ERC7984ETH")) as ERC7984ETH__factory;
  const eUsdtFactory = (await ethers.getContractFactory("ERC7984USDT")) as ERC7984USDT__factory;
  const swapFactory = (await ethers.getContractFactory("NightfallSwap")) as NightfallSwap__factory;

  const eEth = (await eEthFactory.deploy()) as ERC7984ETH;
  const eUsdt = (await eUsdtFactory.deploy()) as ERC7984USDT;
  await eEth.waitForDeployment();
  await eUsdt.waitForDeployment();

  const swap = (await swapFactory.deploy(await eEth.getAddress(), await eUsdt.getAddress())) as NightfallSwap;
  await swap.waitForDeployment();

  const swapAddress = await swap.getAddress();
  await eUsdt.faucet(swapAddress, 10_000n * BASE_UNIT);
  await eEth.faucet(swapAddress, 10_000n * BASE_UNIT);

  return { deployer, alice, bob, eEth, eUsdt, swap, swapAddress };
}

async function encryptAmount(contractAddress: string, owner: string, amount: bigint) {
  const input = fhevm.createEncryptedInput(contractAddress, owner);
  input.add64(amount);
  return input.encrypt();
}

async function decryptBalance(
  token: ERC7984ETH | ERC7984USDT,
  holder: HardhatEthersSigner | string,
  signer: HardhatEthersSigner
) {
  const account = typeof holder === "string" ? holder : holder.address;
  const encryptedBalance = await token.confidentialBalanceOf(account);
  if (encryptedBalance === ethers.ZeroHash) {
    return 0n;
  }

  const clearBalance = await fhevm.userDecryptEuint(
    FhevmType.euint64,
    encryptedBalance,
    await token.getAddress(),
    signer
  );

  return BigInt(clearBalance.toString());
}

function extractSwapEventArgs(receipt: ContractTransactionReceipt, swap: NightfallSwap) {
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = swap.interface.parseLog(log);
      if (parsed && parsed.name === "SwapExecuted") {
        return parsed.args;
      }
    } catch {
      continue;
    }
  }
  throw new Error("SwapExecuted event not found");
}

async function decryptEventAmount(
  handle: string,
  contractAddress: string,
  signer: HardhatEthersSigner
): Promise<bigint> {
  const decrypted = await fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signer);
  return BigInt(decrypted.toString());
}

describe("NightfallSwap", function () {
  before(function () {
    if (!fhevm.isMock) {
      console.warn("NightfallSwap tests are only supported on the local mock network");
      this.skip();
    }
  });

  it("swaps eETH to eUSDT using encrypted amounts", async function () {
    const { alice, eEth, eUsdt, swap, swapAddress } = await deploySwapFixture();

    await eEth.faucet(alice.address, 12n * BASE_UNIT);
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    await eEth.connect(alice).setOperator(swapAddress, expiry);

    const encryptedInput = await encryptAmount(swapAddress, alice.address, 2n * BASE_UNIT);
    const tx = await swap.connect(alice).swapEthToUsdt(encryptedInput.handles[0], encryptedInput.inputProof);
    const receipt = await tx.wait();
    const eventArgs = extractSwapEventArgs(receipt!, swap);
    const quotedOut = await decryptEventAmount(eventArgs.encryptedAmountOut, await eUsdt.getAddress(), alice);
    const quotedIn = await decryptEventAmount(eventArgs.encryptedAmountIn, await eEth.getAddress(), alice);

    const usdtBalance = await decryptBalance(eUsdt, alice, alice);

    expect(quotedIn).to.equal(2n * BASE_UNIT);
    expect(quotedOut).to.equal(2n * BASE_UNIT * RATE);
    expect(usdtBalance).to.equal(quotedOut);
  });

  it("swaps eUSDT back to eETH", async function () {
    const { alice, eEth, eUsdt, swap, swapAddress } = await deploySwapFixture();

    await eUsdt.faucet(alice.address, 20_000n * BASE_UNIT);
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    await eUsdt.connect(alice).setOperator(swapAddress, expiry);

    const initialUsdt = await decryptBalance(eUsdt, alice, alice);
    const encryptedInput = await encryptAmount(swapAddress, alice.address, 6_600n * BASE_UNIT);
    const tx = await swap.connect(alice).swapUsdtToEth(encryptedInput.handles[0], encryptedInput.inputProof);
    const receipt = await tx.wait();
    const eventArgs = extractSwapEventArgs(receipt!, swap);
    const quotedOut = await decryptEventAmount(eventArgs.encryptedAmountOut, await eEth.getAddress(), alice);
    const finalUsdt = await decryptBalance(eUsdt, alice, alice);

    expect(quotedOut).to.equal(2n * BASE_UNIT);
    expect(initialUsdt - finalUsdt).to.equal(6_600n * BASE_UNIT);
  });

  it("requires operator approval before pulling funds", async function () {
    const { alice, eEth, swap, swapAddress } = await deploySwapFixture();

    await eEth.faucet(alice.address, 5n * BASE_UNIT);
    const encryptedInput = await encryptAmount(swapAddress, alice.address, 1n * BASE_UNIT);

    await expect(
      swap.connect(alice).swapEthToUsdt(encryptedInput.handles[0], encryptedInput.inputProof)
    ).to.be.revertedWithCustomError(eEth, "ERC7984UnauthorizedSpender");
  });
});
