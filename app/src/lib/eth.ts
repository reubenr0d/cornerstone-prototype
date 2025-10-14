import { ethers } from 'ethers';
import { CornerstoneProjectABI, ProjectRegistryABI, ERC20ABI } from '@/abi';

export type Address = `0x${string}`;

export type ContractsConfig = {
  registry?: Address;
  usdc?: Address;
};

export const getWindowEthereum = () => (window as any).ethereum as any | undefined;

export async function getProvider(): Promise<ethers.BrowserProvider> {
  const eth = getWindowEthereum();
  if (!eth) throw new Error('No injected wallet found');
  return new ethers.BrowserProvider(eth);
}

export async function getSigner(): Promise<ethers.Signer> {
  const provider = await getProvider();
  // request accounts if needed
  await provider.send('eth_requestAccounts', []);
  return await provider.getSigner();
}

export function getRpcProvider(): ethers.JsonRpcProvider {
  const url = (import.meta as any).env?.VITE_RPC_URL || 'http://127.0.0.1:8545';
  return new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
}

export function erc20At(address: Address, signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(address, ERC20ABI, signerOrProvider);
}

export function registryAt(address: Address, signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(address, ProjectRegistryABI, signerOrProvider);
}

export function projectAt(address: Address, signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(address, CornerstoneProjectABI, signerOrProvider);
}

export function toUSDC(amount: string | number): bigint {
  const v = typeof amount === 'number' ? amount.toString() : amount;
  return ethers.parseUnits(v || '0', 6);
}

export function fromUSDC(amount: bigint): string {
  return ethers.formatUnits(amount, 6);
}

export async function ensureAllowance(
  token: Address,
  owner: Address,
  spender: Address,
  amount: bigint,
  signer: ethers.Signer,
) {
  const t = erc20At(token, signer);
  const current: bigint = await t.allowance(owner, spender);
  if (current >= amount) return;
  const tx = await t.approve(spender, amount);
  await tx.wait();
}

export async function getAccount(): Promise<Address | null> {
  const eth = getWindowEthereum();
  if (!eth) return null;
  const provider = await getProvider();
  const accounts = await provider.send('eth_accounts', []);
  const addr = accounts?.[0] as string | undefined;
  return (addr ? (addr as Address) : null);
}
