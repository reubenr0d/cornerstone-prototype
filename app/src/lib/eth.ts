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
  return new ethers.Contract(address, ERC20ABI as ethers.InterfaceAbi, signerOrProvider);
}

export function registryAt(address: Address, signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(address, ProjectRegistryABI as ethers.InterfaceAbi, signerOrProvider);
}

export function projectAt(address: Address, signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(address, CornerstoneProjectABI as ethers.InterfaceAbi, signerOrProvider);
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

// ============================================================================
// Contract Data Fetching - Split into Real-time vs Static
// ============================================================================

/**
 * Real-time calculated values that change frequently
 * These should always be fetched directly from the contract
 */
export type ProjectRealtimeState = {
  reserveBalance: bigint;
  poolBalance: bigint;
  principalBuffer: bigint;
  withdrawableDevFunds: bigint;
  paused: boolean;
  fundraiseClosed: boolean;
  fundraiseSuccessful: boolean;
  claimableInterest?: bigint;
  claimableRevenue?: bigint;
  userBalance?: bigint;
};

/**
 * Static configuration that rarely or never changes
 * Can be cached or fetched from Envio
 */
export type ProjectStaticConfig = {
  token: Address;
  usdc: Address;
  owner: Address;
  projectName: string;
  minRaise: bigint;
  maxRaise: bigint;
  fundraiseDeadline: bigint;
  perPhaseAprBps: number[];
};

/**
 * Fetch real-time calculated values from contract
 * These values change with every transaction and accrual
 */
export async function fetchProjectRealtimeState(
  projectAddress: Address,
  provider: ethers.Provider | ethers.Signer,
  account?: Address
): Promise<ProjectRealtimeState> {
  const proj = projectAt(projectAddress, provider);
  
  const [
    reserveBalance,
    poolBalance,
    principalBuffer,
    withdrawableDevFunds,
    paused,
    fundraiseClosed,
    fundraiseSuccessful,
  ] = await Promise.all([
    proj.reserveBalance(),
    proj.poolBalance(),
    proj.principalBuffer(),
    proj.withdrawableDevFunds(),
    proj.paused(),
    proj.fundraiseClosed(),
    proj.fundraiseSuccessful(),
  ]);
  
  let claimableInterest, claimableRevenue, userBalance;
  if (account) {
    const tokenAddr: Address = await proj.token();
    const tokenC = erc20At(tokenAddr, provider);
    [claimableInterest, claimableRevenue, userBalance] = await Promise.all([
      proj.claimableInterest(account),
      proj.claimableRevenue(account),
      tokenC.balanceOf(account),
    ]);
  }
  
  return {
    reserveBalance,
    poolBalance,
    principalBuffer,
    withdrawableDevFunds,
    paused,
    fundraiseClosed,
    fundraiseSuccessful,
    ...(account && { claimableInterest, claimableRevenue, userBalance }),
  };
}

/**
 * Fetch static configuration that rarely changes
 * This data can be cached or supplemented from Envio
 */
export async function fetchProjectStaticConfig(
  projectAddress: Address,
  provider: ethers.Provider
): Promise<ProjectStaticConfig> {
  const proj = projectAt(projectAddress, provider);
  
  const [token, usdc, owner, minRaise, maxRaise, fundraiseDeadline] = await Promise.all([
    proj.token(),
    proj.usdc(),
    proj.owner(),
    proj.minRaise(),
    proj.maxRaise(),
    proj.fundraiseDeadline(),
  ]);
  
  const aprBps: number[] = [];
  for (let i = 0; i <= 5; i++) {
    const bps = await proj.phaseAPRsBps(i);
    aprBps.push(Number(bps));
  }
  
  let projectName = '';
  try {
    const tokenContract = erc20At(token as Address, provider);
    projectName = await tokenContract.name();
  } catch {
    projectName = '';
  }
  
  return {
    token: token as Address,
    usdc: usdc as Address,
    owner: owner as Address,
    projectName,
    minRaise,
    maxRaise,
    fundraiseDeadline,
    perPhaseAprBps: aprBps,
  };
}

