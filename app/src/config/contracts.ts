import { Address } from '@/lib/eth';

export type DeployedAddresses = {
  registry?: Address;
  usdc?: Address;
  envioGraphqlUrl?: string;
};

const fromEnv = () => ({
  registry: (import.meta.env.VITE_REGISTRY_ADDRESS as Address | undefined) ?? undefined,
  usdc: (import.meta.env.VITE_USDC_ADDRESS as Address | undefined) ?? undefined,
  envioGraphqlUrl: (import.meta.env.VITE_ENVIO_GRAPHQL_URL as string | undefined) ?? 'https://indexer.dev.hyperindex.xyz/0dc0e74/v1/graphql',
});

export const contractsConfig: DeployedAddresses = {
  ...fromEnv(),
};
