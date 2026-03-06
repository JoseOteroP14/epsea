import * as Network from "expo-network";
import { useEffect, useState } from "react";

export function useNetwork() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    async function check() {
      const state = await Network.getNetworkStateAsync();
      if (mounted) {
        setIsConnected(state.isConnected ?? false);
      }
    }

    check();

    // Poll every 10 seconds since expo-network doesn't have a subscription API
    const interval = setInterval(check, 10_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { isConnected };
}

export async function checkConnectivity(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected ?? false;
  } catch {
    return false;
  }
}
