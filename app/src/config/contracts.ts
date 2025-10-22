import { Address } from '@/lib/eth';

// Token definitions - add more stablecoins here as needed
export const SUPPORTED_TOKENS = {
  PYUSD: {
    name: 'PayPal USD',
    symbol: 'PYUSD',
    decimals: 6,
  },
  USDC: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 6,
  },
} as const;

// Default token to use across the app - change this to switch default stablecoin
export const TOKEN_CONFIG = SUPPORTED_TOKENS.PYUSD;

export type DeployedAddresses = {
  registry?: Address;
  pyusd?: Address;
  usdc?: Address;
  envioGraphqlUrl?: string;
};

const fromEnv = () => {
  const envioGraphqlUrl = import.meta.env.VITE_ENVIO_GRAPHQL_URL as string | undefined;
  
  if (!envioGraphqlUrl) {
    console.error('VITE_ENVIO_GRAPHQL_URL environment variable is required but not set');
    throw new Error('VITE_ENVIO_GRAPHQL_URL environment variable is required but not set');
  }
  
  return {
    registry: (import.meta.env.VITE_REGISTRY_ADDRESS as Address | undefined) ?? undefined,
    pyusd: (import.meta.env.VITE_PYUSD_ADDRESS as Address | undefined) ?? undefined,
    usdc: (import.meta.env.VITE_USDC_ADDRESS as Address | undefined) ?? undefined,
    envioGraphqlUrl,
  };
};

export const contractsConfig: DeployedAddresses = {
  ...fromEnv(),
};

// Helper to get token config by address
export function getTokenConfigByAddress(address: Address): typeof SUPPORTED_TOKENS[keyof typeof SUPPORTED_TOKENS] | null {
  if (address.toLowerCase() === contractsConfig.pyusd?.toLowerCase()) {
    return SUPPORTED_TOKENS.PYUSD;
  }
  if (address.toLowerCase() === contractsConfig.usdc?.toLowerCase()) {
    return SUPPORTED_TOKENS.USDC;
  }
  return null;
}
