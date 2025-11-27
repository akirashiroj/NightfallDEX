# Nightfall DEX

Nightfall DEX is a privacy-preserving swap that lets users exchange Zama FHEVM encrypted eETH and eUSDT at a fixed rate of `1 eETH = 3300 eUSDT`. All balances stay encrypted on-chain, while the frontend handles encryption, decryption, and swaps without ever revealing cleartext values to the network.

## Why it matters
- Privacy-first DeFi: balances and swap amounts remain encrypted (ERC7984) while still being usable in smart contracts.
- Deterministic onboarding: a fixed price makes it easy to demo FHEVM swaps without relying on oracles or external liquidity.
- User-controlled visibility: the UI shows encrypted balances by default and lets the holder decrypt locally via the relayer flow.
- Gas and UX friendly: operator approvals are granted once per token, after which swaps are single-click.
- Built for production paths: contracts are TypeChain-typed, deployable to Sepolia with a private key (no mnemonic), and frontend reads/writes use the recommended viem + ethers split.

## What problems it solves
- On-chain confidentiality: hides token balances and swap amounts while keeping them fully functional.
- Simple, predictable pricing: avoids MEV and oracle risk for this demo pair by locking the rate on-chain.
- Easy developer iteration: local mock FHEVM node plus tasks to inspect encrypted balances accelerate debugging without exposing real data.
- Frontend clarity: shows both encrypted handles and opt-in decrypted values so users understand what is stored on-chain.

## Architecture at a glance
- Contracts (`contracts/`)
  - `ERC7984ETH.sol` and `ERC7984USDT.sol`: encrypted ERC7984 tokens with a faucet for local minting.
  - `NightfallSwap.sol`: fixed-rate swap between eETH and eUSDT. Emits `SwapExecuted` with encrypted in/out amounts, never uses `msg.sender` inside view functions, and enforces correct token routing.
- Deployment (`deploy/deploy.ts`): Hardhat Deploy script wiring tokens into the swap. Uses `process.env.INFURA_API_KEY`, `process.env.PRIVATE_KEY`, and optional `process.env.ETHERSCAN_API_KEY`. No mnemonic is used.
- Tasks (`tasks/`)
  - `swap:addresses`: prints deployed token and swap addresses.
  - `swap:decrypt-balance`: decrypts a local encrypted balance (mock network only).
- Tests (`test/`): FHE-aware tests that cover both swap directions, operator approvals, and event data decryption on the mock network.
- Frontend (`src/`): React + Vite + RainbowKit + wagmi/viem for reads and ethers for writes. Uses Zama relayer SDK for encryption/decryption and a Sepolia-only chain configuration.
- Deployments (`deployments/`): generated ABIs and addresses (e.g., `deployments/sepolia/*.json`). The frontend must use these generated ABIs—copy from here whenever you redeploy.

## Tech stack
- On-chain: Solidity 0.8.27, FHEVM Solidity lib, confidential-contracts-v91 (ERC7984), Hardhat + hardhat-deploy, TypeScript, TypeChain.
- Off-chain: React 19, Vite, wagmi + RainbowKit, viem (reads), ethers v6 (writes), `@zama-fhe/relayer-sdk`.
- Tooling: eslint/solhint/prettier, solidity-coverage, hardhat-gas-reporter.

## Swap mechanics
- Fixed rate: `ETH_TO_USDT_RATE` is 3300 and baked into the contract.
- Input flow: the frontend encrypts the input with the relayer SDK (`createEncryptedInput`) and calls `swapEthToUsdt` or `swapUsdtToEth` with the handle and proof.
- Output flow: amounts out are encrypted, ACL’d, and transferred back to the trader. `SwapExecuted` emits encrypted in/out values for optional client-side decryption.
- Operator approval: each token requires a one-time `setOperator` grant to the swap contract before pull-based transfers.

## Getting started
### Prerequisites
- Node.js 20+
- npm

### Install dependencies
```bash
npm install               # backend / contracts
npm --prefix src install  # frontend
```

### Environment variables (root `.env`)
```
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=0xyour_private_key   # required for any live network deploy
ETHERSCAN_API_KEY=optional_for_verification
```
Use a private key (never a mnemonic) for deployments. The config expects `PRIVATE_KEY` and `INFURA_API_KEY`; without them Sepolia actions will fail.

## Local development
1) Start a local FHE-ready node  
```bash
npm run chain
```
2) Deploy contracts to localhost  
```bash
npm run deploy:localhost
```
3) Run the test suite (mock FHEVM)  
```bash
npm test
```
4) Inspect addresses  
```bash
npx hardhat swap:addresses --network localhost
```
5) Decrypt a local balance (mock network only)  
```bash
npx hardhat swap:decrypt-balance --token eeth --network localhost --account <address>
```

### Working with tokens locally
- Each token exposes `faucet(address,uint64)` for quick funding in tests or scripts.
- Grant operator access once per token with `setOperator(<swap_address>, <expiry>)` before swapping.

## Frontend (Sepolia)
1) Install (already shown) and run:
```bash
npm --prefix src run dev -- --host
```
2) Connect a Sepolia wallet via RainbowKit (no localhost network support).  
3) Initialize the relayer (handled by the UI via `SepoliaConfig`).  
4) View encrypted balances, decrypt locally on demand, grant operator access, then execute swaps.

> The frontend uses static addresses/ABIs from `src/src/config/contracts.ts`. When you redeploy, copy the new ABIs and addresses from `deployments/<network>` into that config. Do not rely on environment variables or localhost RPC endpoints in the UI.

## Deploying to Sepolia
```bash
npm run deploy:sepolia       # uses INFURA_API_KEY + PRIVATE_KEY
npm run verify:sepolia -- <address>  # optional verification
```
- Deployment artifacts live in `deployments/sepolia/` (copy ABIs to the frontend config).
- A private key is mandatory; mnemonics are intentionally unsupported per project policy.

## Testing
- Unit/integration (mock FHEVM): `npm test`
- Sepolia smoke (requires funded PRIVATE_KEY and INFURA_API_KEY): `npm run test:sepolia`
- Coverage: `npm run coverage`

## Future roadmap
- Dynamic pricing with on-chain oracles and slippage controls.
- Multi-asset support with additional encrypted pairs and pooled liquidity.
- Circuit breaker and rate governance for safer mainnet operation.
- Enhanced UX: activity timeline with decrypted summaries (user-side), better error surfacing from relayer flows.
- Observability: structured swap event indexing for wallets/analytics.

## Reference docs
- Zama FHEVM: https://docs.zama.ai/fhevm
- Relayer SDK notes: `docs/zama_doc_relayer.md`
- Solidity guides for FHEVM: `docs/zama_llm.md`

## License
BSD-3-Clause-Clear. See `LICENSE` for full text.
