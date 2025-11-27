import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Nightfall DEX',
  projectId: 'nightfall-dex-app',
  chains: [sepolia],
  ssr: false,
});
