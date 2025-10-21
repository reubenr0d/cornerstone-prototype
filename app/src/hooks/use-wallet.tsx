import { useState, useEffect, useCallback } from 'react';
import { getSigner, getWindowEthereum } from '@/lib/eth';
import { ethers } from 'ethers';

export const useWallet = () => {
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if wallet is already connected on mount
  useEffect(() => {
    const checkConnection = async () => {
      const eth = getWindowEthereum();
      if (!eth) return;
      
      try {
        const accounts = await eth.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          setAccount(accounts[0]);
        }
      } catch (err) {
        console.error('Failed to check wallet connection:', err);
      }
    };

    checkConnection();

    // Listen for account changes
    const eth = getWindowEthereum();
    if (eth) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          setAccount(null);
        }
      };

      eth.on('accountsChanged', handleAccountsChanged);

      return () => {
        eth.removeListener('accountsChanged', handleAccountsChanged);
      };
    }
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const eth = getWindowEthereum();
      if (!eth) {
        throw new Error('Please install MetaMask or another Web3 wallet');
      }

      const signer = await getSigner();
      const address = await signer.getAddress();
      setAccount(address);
    } catch (err: any) {
      const message = err?.message || 'Failed to connect wallet';
      setError(message);
      console.error('Wallet connection error:', err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
  }, []);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return {
    account,
    isConnected: !!account,
    isConnecting,
    error,
    connect,
    disconnect,
    formatAddress: account ? formatAddress(account) : null,
  };
};
