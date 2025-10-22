/* eslint-disable react-refresh/only-export-components */
import useInitNexus from "@/hooks/useInitNexus";
import {
  NexusSDK,
  type OnAllowanceHookData,
  type OnIntentHookData,
} from "@avail-project/nexus-core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getWindowEthereum, getAccount, type Address } from "@/lib/eth";

interface NexusContextType {
  nexusSDK: NexusSDK | null;
  intentRefCallback: React.RefObject<OnIntentHookData | null>;
  allowanceRefCallback: React.RefObject<OnAllowanceHookData | null>;
  handleInit: () => Promise<void>;
  account: Address | null;
  isConnected: boolean;
}

const NexusContext = createContext<NexusContextType | null>(null);

const NexusProvider = ({ children }: { children: React.ReactNode }) => {
  const [account, setAccount] = useState<Address | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const sdk = useMemo(
    () =>
      new NexusSDK({
        network: 'testnet',
        debug: true,
      }),
    [],
  );

  const {
    nexusSDK,
    initializeNexus,
    deinitializeNexus,
    attachEventHooks,
    intentRefCallback,
    allowanceRefCallback,
  } = useInitNexus(sdk);

  const handleInit = useCallback(async () => {
    if (sdk.isInitialized()) {
      console.log("Nexus already initialized");
      return;
    }
    await initializeNexus();
    attachEventHooks();
  }, [sdk, attachEventHooks, initializeNexus]);

  // Check wallet connection status
  useEffect(() => {
    const checkConnection = async () => {
      const eth = getWindowEthereum();
      if (!eth) {
        setIsConnected(false);
        setAccount(null);
        return;
      }

      try {
        const currentAccount = await getAccount();
        setAccount(currentAccount);
        setIsConnected(!!currentAccount);
      } catch (error) {
        console.error("Error checking wallet connection:", error);
        setIsConnected(false);
        setAccount(null);
      }
    };

    checkConnection();

    // Listen for account changes
    const eth = getWindowEthereum();
    if (eth) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          setIsConnected(false);
          setAccount(null);
          deinitializeNexus();
        } else {
          const newAccount = accounts[0] as Address;
          setAccount(newAccount);
          setIsConnected(true);
        }
      };

      const handleChainChanged = () => {
        // Reload the page on chain change as recommended by MetaMask
        window.location.reload();
      };

      const handleDisconnect = () => {
        setIsConnected(false);
        setAccount(null);
        deinitializeNexus();
      };

      eth.on("accountsChanged", handleAccountsChanged);
      eth.on("chainChanged", handleChainChanged);
      eth.on("disconnect", handleDisconnect);

      return () => {
        eth.removeListener("accountsChanged", handleAccountsChanged);
        eth.removeListener("chainChanged", handleChainChanged);
        eth.removeListener("disconnect", handleDisconnect);
      };
    }
  }, [deinitializeNexus]);

  // Handle Nexus initialization/deinitialization based on connection
  useEffect(() => {
    /**
     * Uncomment to initialize Nexus SDK as soon as wallet is connected
     */
    // if (isConnected) {
    //   handleInit();
    // }
    if (!isConnected) {
      deinitializeNexus();
    }
  }, [isConnected, deinitializeNexus]);

  const value = useMemo(
    () => ({
      nexusSDK,
      intentRefCallback,
      allowanceRefCallback,
      handleInit,
      account,
      isConnected,
    }),
    [nexusSDK, intentRefCallback, allowanceRefCallback, handleInit, account, isConnected],
  );

  return (
    <NexusContext.Provider value={value}>{children}</NexusContext.Provider>
  );
};

export function useNexus() {
  const context = useContext(NexusContext);
  if (!context) {
    throw new Error("useNexus must be used within a NexusProvider");
  }
  return context;
}

export default NexusProvider;