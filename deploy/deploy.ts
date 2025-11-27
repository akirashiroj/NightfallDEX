import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const INITIAL_LIQUIDITY = 10_000n * 1_000_000n;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const { ethers } = hre;

  const eEthDeployment = await deploy("ERC7984ETH", {
    from: deployer,
    log: true,
  });

  const eUsdtDeployment = await deploy("ERC7984USDT", {
    from: deployer,
    log: true,
  });

  const swapDeployment = await deploy("NightfallSwap", {
    from: deployer,
    args: [eEthDeployment.address, eUsdtDeployment.address],
    log: true,
  });

  const eEthContract = await ethers.getContractAt("ERC7984ETH", eEthDeployment.address);
  const eUsdtContract = await ethers.getContractAt("ERC7984USDT", eUsdtDeployment.address);

  const seedEthTx = await eEthContract.faucet(swapDeployment.address, INITIAL_LIQUIDITY);
  await seedEthTx.wait();
  const seedUsdtTx = await eUsdtContract.faucet(swapDeployment.address, INITIAL_LIQUIDITY);
  await seedUsdtTx.wait();

  console.log(`eETH token deployed at ${eEthDeployment.address}`);
  console.log(`eUSDT token deployed at ${eUsdtDeployment.address}`);
  console.log(`NightfallSwap contract deployed at ${swapDeployment.address}`);
  console.log(`Seeded NightfallSwap with ${INITIAL_LIQUIDITY.toString()} base units of eETH and eUSDT`);
};
export default func;
func.id = "deploy_nightfall_swap"; // id required to prevent reexecution
func.tags = ["NightfallSwap"];
