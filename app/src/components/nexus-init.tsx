/**
 * Use this component to only initialize Nexus when required or with a button click
 * Remove the use effect in @NexusProvider to stop auto init process
 */

import { Button } from "./ui/button";
import { useNexus } from "@/providers/NexusProvider";
import { useState } from "react";
import { Clock } from "lucide-react";

const NexusInitButton = () => {
  const { isConnected, handleInit, nexusSDK } = useNexus();
  const [loading, setLoading] = useState(false);

  const handleInitWithLoading = async () => {
    setLoading(true);
    try {
      await handleInit();
    } catch (error) {
      console.error("Failed to initialize Nexus:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!nexusSDK?.isInitialized()) {
    return (
      <Button onClick={handleInitWithLoading} disabled={loading}>
        {loading ? (
          <Clock className="animate-spin size-5 text-primary-foreground" />
        ) : (
          "Connect Nexus"
        )}
      </Button>
    );
  }

  return null;
};

export default NexusInitButton;