import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

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

  console.log(`eETH token deployed at ${eEthDeployment.address}`);
  console.log(`eUSDT token deployed at ${eUsdtDeployment.address}`);
  console.log(`NightfallSwap contract deployed at ${swapDeployment.address}`);
};
export default func;
func.id = "deploy_nightfall_swap"; // id required to prevent reexecution
func.tags = ["NightfallSwap"];
