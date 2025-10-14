import { Address } from '@/lib/eth';

export type DeployedAddresses = {
  registry?: Address;
  usdc?: Address;
};

const fromEnv = () => ({
  registry: (import.meta.env.VITE_REGISTRY_ADDRESS as Address | undefined) ?? undefined,
  usdc: (import.meta.env.VITE_USDC_ADDRESS as Address | undefined) ?? undefined,
});

export const contractsConfig: DeployedAddresses = {
  ...fromEnv(),
};
