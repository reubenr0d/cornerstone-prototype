import type {
  EthereumProvider,
  NexusSDK,
  OnAllowanceHookData,
  OnIntentHookData,
} from "@avail-project/nexus-core";
import { useRef, useState } from "react";
import { getWindowEthereum } from "@/lib/eth";

const useInitNexus = (sdk: NexusSDK) => {
  const [nexusSDK, setNexusSDK] = useState<NexusSDK | null>(null);
  const intentRefCallback = useRef<OnIntentHookData | null>(null);
  const allowanceRefCallback = useRef<OnAllowanceHookData | null>(null);

  const initializeNexus = async () => {
    try {
      if (sdk.isInitialized()) throw new Error("Nexus is already initialized");
      
      const provider = getWindowEthereum();
      if (!provider) throw new Error("No provider found");
      
      // Cast to EthereumProvider for Nexus SDK
      await sdk.initialize(provider as EthereumProvider);
      setNexusSDK(sdk);
      console.log("Nexus initialized successfully");
    } catch (error) {
      console.error("Error initializing Nexus:", error);
      throw error;
    }
  };

  const deinitializeNexus = async () => {
    try {
      if (!sdk.isInitialized()) {
        console.log("Nexus is not initialized, skipping deinitialization");
        return;
      }
      await sdk.deinit();
      setNexusSDK(null);
      console.log("Nexus deinitialized successfully");
    } catch (error) {
      console.error("Error deinitializing Nexus:", error);
    }
  };

  const attachEventHooks = () => {
    sdk.setOnAllowanceHook((data: OnAllowanceHookData) => {
      // const { sources, allow, deny } = data;
      // This is a hook for the dev to show user the allowances that need to be setup for the current tx to happen
      // where,
      // sources: an array of objects with minAllowance, chainID, token symbol, etc.
      // allow(allowances): continues the transaction flow with the specified allowances; `allowances` is an array with the chosen allowance for each of the requirements (allowances.length === sources.length), either 'min', 'max', a bigint or a string
      // deny(): stops the flow
      allowanceRefCallback.current = data;
    });

    sdk.setOnIntentHook((data: OnIntentHookData) => {
      // const { intent, allow, deny, refresh } = data;
      // This is a hook for the dev to show user the intent, the sources and associated fees
      // where,
      // intent: Intent data containing sources and fees for display purpose
      // allow(): accept the current intent and continue the flow
      // deny(): deny the intent and stop the flow
      // refresh(): should be on a timer of 5s to refresh the intent (old intents might fail due to fee changes if not refreshed)
      intentRefCallback.current = data;
    });
  };

  return {
    nexusSDK,
    initializeNexus,
    deinitializeNexus,
    attachEventHooks,
    intentRefCallback,
    allowanceRefCallback,
  };
};

export default useInitNexus;