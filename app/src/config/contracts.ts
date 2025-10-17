import { Address } from '@/lib/eth';

// Centralized token configuration - change here to use a different stablecoin
export const TOKEN_CONFIG = {
  name: 'PYUSD',
  symbol: 'PYUSD',
  decimals: 6,
} as const;

export type DeployedAddresses = {
  registry?: Address;
  stablecoin?: Address; // The stablecoin used for investments (e.g., PYUSD, USDC)
  envioGraphqlUrl?: string;
};

const fromEnv = () => ({
  registry: (import.meta.env.VITE_REGISTRY_ADDRESS as Address | undefined) ?? undefined,
  stablecoin: (import.meta.env.VITE_USDC_ADDRESS as Address | undefined) ?? undefined,
  envioGraphqlUrl: (import.meta.env.VITE_ENVIO_GRAPHQL_URL as string | undefined) ?? 'https://indexer.dev.hyperindex.xyz/0dc0e74/v1/graphql',
});

export const contractsConfig: DeployedAddresses = {
  ...fromEnv(),
};
