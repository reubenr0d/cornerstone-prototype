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

async function ensureWalletNetwork(provider: ethers.BrowserProvider) {
  try {
    const [walletChainHex, rpcNetwork] = await Promise.all([
      provider.send('eth_chainId', []),
      getRpcProvider().getNetwork(),
    ]);
    const targetChainHex = `0x${rpcNetwork.chainId.toString(16)}`;
    if (typeof walletChainHex === 'string' && walletChainHex.toLowerCase() === targetChainHex.toLowerCase()) {
      return;
    }
    const rpcUrl = (import.meta as any).env?.VITE_RPC_URL || 'http://127.0.0.1:8545';
    const chainName = rpcNetwork.name && rpcNetwork.name !== 'unknown'
      ? rpcNetwork.name
      : `Chain ${rpcNetwork.chainId.toString()}`;
    try {
      await provider.send('wallet_switchEthereumChain', [{ chainId: targetChainHex }]);
      return;
    } catch (switchErr: any) {
      if (switchErr?.code !== 4902) {
        throw switchErr;
      }
      try {
        await provider.send('wallet_addEthereumChain', [{
          chainId: targetChainHex,
          chainName,
          rpcUrls: [rpcUrl],
          nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
          },
        }]);
        await provider.send('wallet_switchEthereumChain', [{ chainId: targetChainHex }]);
      } catch (addErr) {
        throw addErr;
      }
    }
  } catch (err: any) {
    const msg = err?.message || 'Failed to switch wallet network';
    throw new Error(msg);
  }
}

export async function getSigner(): Promise<ethers.Signer> {
  const provider = await getProvider();
  await ensureWalletNetwork(provider);
  // request accounts if needed
  await provider.send('eth_requestAccounts', []);
  return await provider.getSigner();
}

export function getRpcProvider(): ethers.JsonRpcProvider {
  const url = (import.meta as any).env?.VITE_RPC_URL || 'http://127.0.0.1:8545';
  // Use a non-static provider so reads always target the current chain head.
  // Static providers can pin a past blockTag and cause errors after node restarts.
  return new ethers.JsonRpcProvider(url);
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

// ---- DRY helpers for project state ----
export type ProjectCoreState = {
  token: Address;
  usdc: Address;
  owner: Address;
  totalRaised: bigint;
  minRaise: bigint;
  maxRaise: bigint;
  reserveBalance: bigint;
  totalDevWithdrawn: bigint;
  poolBalance: bigint;
  currentPhase: number;
  lastClosedPhase: number;
  phase5PercentComplete: number;
  principalBuffer: bigint;
  perPhaseCaps: bigint[];
  perPhaseWithdrawn: bigint[];
  perPhaseAprBps: number[];
};

export type ProjectUserState = {
  claimableInterest: bigint;
  claimableRevenue: bigint;
  userBalance: bigint;
};

export async function fetchProjectCoreState(
  projectAddress: Address,
  provider: ethers.Provider | ethers.Signer,
): Promise<ProjectCoreState> {
  const proj = projectAt(projectAddress, provider);
  const [token, owner, totalRaised, maxRaise, minRaise, reserveBalance, totalDevWithdrawn, poolBalance, currentPhase, lastClosedPhase, phase5PercentComplete, principalBuffer, usdc] = await Promise.all([
    proj.token(),
    proj.owner(),
    proj.totalRaised(),
    proj.maxRaise(),
    proj.minRaise(),
    proj.reserveBalance(),
    proj.totalDevWithdrawn(),
    proj.poolBalance(),
    proj.currentPhase(),
    proj.lastClosedPhase(),
    proj.phase5PercentComplete(),
    proj.principalBuffer(),
    proj.usdc(),
  ]);
  // Return UI-friendly arrays for 6 phases numbered 0..5.
  // Phase 0 (fundraising) has no cap/APR/withdrawn; fill with 0 at index 0.
  const caps: bigint[] = [0n];
  const withdrawn: bigint[] = [0n];
  for (let p = 1; p <= 5; p++) {
    caps.push(await proj.getPhaseCap(p));
    withdrawn.push(await proj.getPhaseWithdrawn(p));
  }
  const aprBps: number[] = [];
  for (let i = 0; i <= 5; i++) {
    const bps = await proj.phaseAPRsBps(i);
    aprBps.push(Number(bps));
  }
  return {
    token: token as Address,
    usdc: usdc as Address,
    owner: owner as Address,
    totalRaised,
    minRaise,
    maxRaise,
    reserveBalance,
    totalDevWithdrawn,
    poolBalance,
    currentPhase: Number(currentPhase),
    lastClosedPhase: Number(lastClosedPhase),
    phase5PercentComplete: Number(phase5PercentComplete),
    principalBuffer,
    perPhaseCaps: caps,
    perPhaseWithdrawn: withdrawn,
    perPhaseAprBps: aprBps,
  };
}

export async function fetchProjectUserState(
  projectAddress: Address,
  provider: ethers.Provider,
  account: Address,
): Promise<ProjectUserState> {
  const proj = projectAt(projectAddress, provider);
  const tokenAddr: Address = await proj.token();
  const tokenC = erc20At(tokenAddr, provider);
  const [claimableInterest, claimableRevenue, userBalance] = await Promise.all([
    proj.claimableInterest(account),
    proj.claimableRevenue(account),
    tokenC.balanceOf(account),
  ]);
  return { claimableInterest, claimableRevenue, userBalance };
}

export async function fetchSupportersCount(
  projectAddress: Address,
  provider: ethers.Provider,
): Promise<number> {
  try {
    const proj = projectAt(projectAddress, provider);
    const latest = await provider.getBlockNumber();
    const logs = await proj.queryFilter((proj as any).filters.Deposit(), 0, latest);
    const uniq = new Set<string>();
    for (const log of logs) {
      const user = (log as any).args?.[0] ?? (log as any).args?.user;
      if (user) uniq.add(String(user));
    }
    return uniq.size;
  } catch {
    return 0;
  }
}
