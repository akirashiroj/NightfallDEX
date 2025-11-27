import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("swap:addresses", "Print deployed token and swap addresses").setAction(async function (_args, hre) {
  const { deployments } = hre;

  const eEth = await deployments.get("ERC7984ETH");
  const eUsdt = await deployments.get("ERC7984USDT");
  const swap = await deployments.get("NightfallSwap");

  console.log(`ERC7984ETH  : ${eEth.address}`);
  console.log(`ERC7984USDT : ${eUsdt.address}`);
  console.log(`NightfallSwap: ${swap.address}`);
});

task("swap:decrypt-balance", "Decrypt a local encrypted token balance")
  .addParam("token", "Token symbol: eeth or eusdt")
  .addOptionalParam("account", "Account to inspect")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    if (!fhevm.isMock) {
      throw new Error("swap:decrypt-balance can only run against the local mock network");
    }

    await fhevm.initializeCLIApi();

    const symbol = String(taskArguments.token).toLowerCase();
    if (symbol !== "eeth" && symbol !== "eusdt") {
      throw new Error("token param must be either 'eeth' or 'eusdt'");
    }
    const deploymentName = symbol === "eeth" ? "ERC7984ETH" : "ERC7984USDT";
    const deployment = await deployments.get(deploymentName);
    const tokenContract = await ethers.getContractAt(deploymentName, deployment.address);

    const [defaultSigner] = await ethers.getSigners();
    const targetAccount = taskArguments.account ?? defaultSigner.address;

    const encryptedBalance = await tokenContract.confidentialBalanceOf(targetAccount);
    if (encryptedBalance === ethers.ZeroHash) {
      console.log(`Encrypted balance for ${targetAccount}: ${encryptedBalance}`);
      console.log("Clear balance: 0");
      return;
    }

    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      deployment.address,
      defaultSigner
    );

    console.log(`Encrypted balance for ${targetAccount}: ${encryptedBalance}`);
    console.log(`Clear balance: ${clearBalance.toString()}`);
  });
