import { useMemo, useState } from 'react';
import { Contract } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { Header } from './components/Header';
import { NIGHTFALL_SWAP, TOKENS } from './config/contracts';
import { useZamaInstance } from './hooks/useZamaInstance';
import { useEthersSigner } from './hooks/useEthersSigner';
import './styles/Home.css';

type TokenKey = 'eeth' | 'eusdt';
type Direction = 'ETH_TO_USDT' | 'USDT_TO_ETH';

const ZERO_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
const DECIMAL_FACTOR = 1_000_000n;
const RATE = 3300n;

const tokenOrder: TokenKey[] = ['eeth', 'eusdt'];

export function Home() {
  const { address, isConnected } = useAccount();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const signerPromise = useEthersSigner();

  const eethBalance = useReadContract({
    address: TOKENS.eeth.address,
    abi: TOKENS.eeth.abi,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const eusdtBalance = useReadContract({
    address: TOKENS.eusdt.address,
    abi: TOKENS.eusdt.abi,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const balances: Record<TokenKey, string | undefined> = {
    eeth: eethBalance.data as string | undefined,
    eusdt: eusdtBalance.data as string | undefined,
  };

  const [direction, setDirection] = useState<Direction>('ETH_TO_USDT');
  const [amount, setAmount] = useState('');
  const [swapStatus, setSwapStatus] = useState<string | null>(null);
  const [operatorStatus, setOperatorStatus] = useState<Record<TokenKey, string | null>>({
    eeth: null,
    eusdt: null,
  });
  const [decryptState, setDecryptState] = useState<Record<
    TokenKey,
    { loading: boolean; value?: string; error?: string }
  >>({
    eeth: { loading: false },
    eusdt: { loading: false },
  });

  const amountInBase = useMemo(() => parseAmount(amount), [amount]);
  const amountError = amount.length > 0 && amountInBase === null ? 'Enter a valid amount' : null;

  const expectedOut = useMemo(() => {
    if (amountInBase === null || amountInBase === undefined) {
      return null;
    }
    return direction === 'ETH_TO_USDT' ? amountInBase * RATE : amountInBase / RATE;
  }, [amountInBase, direction]);

  const handleSwap = async () => {
    if (!instance || !address) {
      setSwapStatus('Connect your wallet and relayer first');
      return;
    }
    const signer = await signerPromise;
    if (!signer) {
      setSwapStatus('No signer available');
      return;
    }

    if (!amountInBase || amountInBase <= 0n) {
      setSwapStatus('Enter an amount greater than zero');
      return;
    }

    try {
      setSwapStatus('Encrypting amount...');
      const buffer = instance.createEncryptedInput(NIGHTFALL_SWAP.address, address);
      buffer.add64(amountInBase);
      const encryptedInput = await buffer.encrypt();

      const swapContract = new Contract(NIGHTFALL_SWAP.address, NIGHTFALL_SWAP.abi, signer);
      const method = direction === 'ETH_TO_USDT' ? 'swapEthToUsdt' : 'swapUsdtToEth';

      setSwapStatus('Waiting for confirmation...');
      const tx = await swapContract[method](encryptedInput.handles[0], encryptedInput.inputProof);
      setSwapStatus('Submitting transaction to the network...');
      await tx.wait();
      setSwapStatus('Swap completed successfully');
    } catch (error) {
      console.error('Swap failed', error);
      setSwapStatus(error instanceof Error ? error.message : 'Swap failed');
    }
  };

  const handleDecrypt = async (tokenKey: TokenKey) => {
    if (!instance || !address) {
      updateDecryptState(tokenKey, { error: 'Connect wallet and relayer' });
      return;
    }
    const signer = await signerPromise;
    if (!signer) {
      updateDecryptState(tokenKey, { error: 'No signer available' });
      return;
    }

    const encryptedValue = balances[tokenKey];
    if (!encryptedValue || encryptedValue === ZERO_HANDLE) {
      updateDecryptState(tokenKey, { value: '0', error: undefined });
      return;
    }

    try {
      updateDecryptState(tokenKey, { loading: true, error: undefined });
      const keypair = instance.generateKeypair();
      const handlePairs = [{ handle: encryptedValue, contractAddress: TOKENS[tokenKey].address }];
      const startTimestamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [TOKENS[tokenKey].address];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimestamp, durationDays);
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message
      );

      const result = await instance.userDecrypt(
        handlePairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimestamp,
        durationDays
      );

      const clearValue = result[encryptedValue] ?? '0';
      updateDecryptState(tokenKey, { value: formatAmount(BigInt(clearValue)), error: undefined });
    } catch (error) {
      console.error('Decrypt failed', error);
      updateDecryptState(tokenKey, { error: error instanceof Error ? error.message : 'Decrypt failed' });
    }
  };

  const handleOperatorGrant = async (tokenKey: TokenKey) => {
    const signer = await signerPromise;
    if (!signer) {
      setOperatorStatus(prev => ({ ...prev, [tokenKey]: 'Connect wallet first' }));
      return;
    }

    try {
      setOperatorStatus(prev => ({ ...prev, [tokenKey]: 'Waiting for approval...' }));
      const tokenContract = new Contract(TOKENS[tokenKey].address, TOKENS[tokenKey].abi, signer);
      const expiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
      const tx = await tokenContract.setOperator(NIGHTFALL_SWAP.address, expiry);
      await tx.wait();
      setOperatorStatus(prev => ({ ...prev, [tokenKey]: 'Operator granted' }));
    } catch (error) {
      console.error('Operator grant failed', error);
      setOperatorStatus(prev => ({
        ...prev,
        [tokenKey]: error instanceof Error ? error.message : 'Failed to set operator',
      }));
    }
  };

  const updateDecryptState = (tokenKey: TokenKey, next: Partial<{ loading: boolean; value?: string; error?: string }>) => {
    setDecryptState(prev => ({
      ...prev,
      [tokenKey]: { ...prev[tokenKey], ...next },
    }));
  };

  return (
    <div className="home">
      <div className="home__container">
        <Header />

        <div className="home__grid">
          <section className="card">
            <h2 className="card__title">Token balances</h2>
            <div className="balance-grid">
              {tokenOrder.map(tokenKey => {
                const token = TOKENS[tokenKey];
                const encryptedValue = balances[tokenKey];
                const decryptInfo = decryptState[tokenKey];
                return (
                  <div className="card balance-card" key={tokenKey}>
                    <div className="balance-card__header">
                      <div className="balance-card__token">{token.symbol}</div>
                      {decryptInfo.value && <div className="status-tag">{decryptInfo.value} {token.symbol}</div>}
                    </div>
                    <p className="balance-card__handle">
                      {isConnected ? encryptedValue ?? 'Loading...' : 'Connect wallet to view balances'}
                    </p>
                    <div className="balance-card__actions">
                      <button
                        className="btn btn--primary"
                        onClick={() => handleDecrypt(tokenKey)}
                        disabled={!isConnected || zamaLoading}
                      >
                        {decryptInfo.loading ? 'Decrypting...' : 'Decrypt'}
                      </button>
                      {decryptInfo.error && <span className="status-tag">{decryptInfo.error}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <h2 className="card__title">Instant swap</h2>
            <div className="swap-card__inputs">
              <div className="swap-card__field">
                <label className="swap-card__label">Amount</label>
                <input
                  className="swap-card__input"
                  placeholder="0.0"
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  inputMode="decimal"
                />
                {amountError && <span className="swap-card__hint">{amountError}</span>}
              </div>

              <div className="swap-card__field">
                <label className="swap-card__label">Direction</label>
                <div className="swap-card__direction">
                  <button
                    className={`swap-card__pill ${direction === 'ETH_TO_USDT' ? 'swap-card__pill--active' : ''}`}
                    onClick={() => setDirection('ETH_TO_USDT')}
                  >
                    eETH → eUSDT
                  </button>
                  <button
                    className={`swap-card__pill ${direction === 'USDT_TO_ETH' ? 'swap-card__pill--active' : ''}`}
                    onClick={() => setDirection('USDT_TO_ETH')}
                  >
                    eUSDT → eETH
                  </button>
                </div>
              </div>
            </div>

            <p className="swap-card__hint">
              Fixed rate: 1 eETH = {RATE.toString()} eUSDT
              {expectedOut !== null && amountInBase !== null && (
                <>
                  <br />
                  You will receive approximately {formatAmount(expectedOut)}{' '}
                  {direction === 'ETH_TO_USDT' ? 'eUSDT' : 'eETH'}.
                </>
              )}
            </p>

            <button className="btn btn--primary" onClick={handleSwap} disabled={!isConnected || zamaLoading}>
              Swap now
            </button>
            {swapStatus && <p className="swap-card__hint" style={{ marginTop: '0.75rem' }}>{swapStatus}</p>}
            {zamaError && <p className="swap-card__hint">Encryption error: {zamaError}</p>}
          </section>
        </div>

        <section className="card" style={{ marginTop: '1.5rem' }}>
          <h2 className="card__title">Operator access</h2>
          <p className="swap-card__hint">
            NightfallSwap requires operator permission to move your encrypted tokens. Grant approval once per token.
          </p>
          <div className="operator-grid">
            {tokenOrder.map(tokenKey => (
              <div className="card" key={`operator-${tokenKey}`}>
                <div className="balance-card__header">
                  <span className="balance-card__token">{TOKENS[tokenKey].symbol}</span>
                </div>
                <button className="btn btn--ghost" onClick={() => handleOperatorGrant(tokenKey)} disabled={!isConnected}>
                  Grant swap access
                </button>
                {operatorStatus[tokenKey] && <p className="swap-card__hint">{operatorStatus[tokenKey]}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function parseAmount(value: string): bigint | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/,/g, '.').trim();
  if (!/^\d*\.?\d*$/.test(normalized)) {
    return null;
  }
  const [whole, fraction = ''] = normalized.split('.');
  if (!whole && !fraction) {
    return null;
  }
  const paddedFraction = (fraction + '000000').slice(0, 6);
  try {
    return BigInt(whole || '0') * DECIMAL_FACTOR + BigInt(paddedFraction || '0');
  } catch {
    return null;
  }
}

function formatAmount(value: bigint): string {
  const whole = value / DECIMAL_FACTOR;
  const fraction = value % DECIMAL_FACTOR;
  if (fraction === 0n) {
    return whole.toString();
  }
  const fractionString = fraction.toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fractionString}`;
}

export default Home;
