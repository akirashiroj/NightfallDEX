import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="app-header">
      <div className="app-header__content">
        <div className="app-header__text">
          <p className="app-header__eyebrow">Nightfall DEX</p>
          <h1>Confidential swaps for encrypted assets</h1>
          <p className="app-header__subtitle">
            Swap eETH and eUSDT at a predictable rate while keeping balances protected by FHE.
          </p>
        </div>
        <div className="app-header__cta">
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
