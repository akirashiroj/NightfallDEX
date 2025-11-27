// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC7984} from "confidential-contracts-v91/contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "confidential-contracts-v91/contracts/interfaces/IERC7984Receiver.sol";
import {FHE, ebool, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title NightfallSwap
/// @notice Fixed-rate swap between eETH and eUSDT that keeps all balances encrypted on-chain.
contract NightfallSwap is IERC7984Receiver, ZamaEthereumConfig {
    IERC7984 public immutable eEthToken;
    IERC7984 public immutable eUsdtToken;

    uint64 public constant ETH_TO_USDT_RATE = 3300;

    event SwapExecuted(
        address indexed account,
        address indexed tokenIn,
        address indexed tokenOut,
        euint64 encryptedAmountIn,
        euint64 encryptedAmountOut
    );

    error InvalidTokenAddress();
    error UnsupportedToken(address token);
    error MissingAmount();

    constructor(address eEth_, address eUsdt_) {
        if (eEth_ == address(0) || eUsdt_ == address(0) || eEth_ == eUsdt_) {
            revert InvalidTokenAddress();
        }
        eEthToken = IERC7984(eEth_);
        eUsdtToken = IERC7984(eUsdt_);
    }

    /// @notice Swap eETH for eUSDT using an encrypted input amount.
    function swapEthToUsdt(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint64) {
        euint64 decodedAmount = FHE.fromExternal(encryptedAmount, inputProof);
        return _swapTokens(eEthToken, eUsdtToken, msg.sender, decodedAmount, true, true);
    }

    /// @notice Swap eUSDT for eETH using an encrypted input amount.
    function swapUsdtToEth(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint64) {
        euint64 decodedAmount = FHE.fromExternal(encryptedAmount, inputProof);
        return _swapTokens(eUsdtToken, eEthToken, msg.sender, decodedAmount, false, true);
    }

    /// @dev Support direct transfers using confidentialTransferAndCall from the tokens.
    function onConfidentialTransferReceived(
        address,
        address from,
        euint64 amount,
        bytes calldata
    ) external override returns (ebool) {
        if (!FHE.isInitialized(amount)) {
            revert MissingAmount();
        }

        if (msg.sender == address(eEthToken)) {
            _swapTokens(eEthToken, eUsdtToken, from, amount, true, false);
            return FHE.asEbool(true);
        }

        if (msg.sender == address(eUsdtToken)) {
            _swapTokens(eUsdtToken, eEthToken, from, amount, false, false);
            return FHE.asEbool(true);
        }

        revert UnsupportedToken(msg.sender);
    }

    /// @notice Returns contract token addresses.
    function getTokens() external view returns (address eEth, address eUsdt) {
        return (address(eEthToken), address(eUsdtToken));
    }

    function _swapTokens(
        IERC7984 tokenIn,
        IERC7984 tokenOut,
        address trader,
        euint64 encryptedAmountIn,
        bool isEthForUsdt,
        bool pullFromUser
    ) internal returns (euint64) {
        if (pullFromUser) {
            FHE.allow(encryptedAmountIn, address(tokenIn));
        }

        euint64 transferredIn = pullFromUser ? _collectInput(tokenIn, trader, encryptedAmountIn) : encryptedAmountIn;
        euint64 quotedOutput = isEthForUsdt
            ? _quoteEthToUsdt(transferredIn, tokenOut)
            : _quoteUsdtToEth(transferredIn, tokenOut);
        euint64 transferredOut = tokenOut.confidentialTransfer(trader, quotedOutput);

        emit SwapExecuted(trader, address(tokenIn), address(tokenOut), transferredIn, transferredOut);
        return transferredOut;
    }

    function _collectInput(
        IERC7984 token,
        address trader,
        euint64 encryptedAmount
    ) internal returns (euint64) {
        return token.confidentialTransferFrom(trader, address(this), encryptedAmount);
    }

    function _quoteEthToUsdt(euint64 amount, IERC7984 tokenOut) internal returns (euint64) {
        euint64 result = FHE.mul(amount, FHE.asEuint64(ETH_TO_USDT_RATE));
        _allowQuote(result, tokenOut);
        return result;
    }

    function _quoteUsdtToEth(euint64 amount, IERC7984 tokenOut) internal returns (euint64) {
        euint64 result = FHE.div(amount, ETH_TO_USDT_RATE);
        _allowQuote(result, tokenOut);
        return result;
    }

    function _allowQuote(euint64 amount, IERC7984 tokenOut) internal {
        FHE.allowThis(amount);
        FHE.allow(amount, address(tokenOut));
    }
}
