import * as Network from "expo-network";
import { useEffect, useState } from "react";

/** Poll de respaldo: mitiga el race de Android donde activeNetwork sigue stale tras onLost. */
const POLL_INTERVAL_MS = 2_000;
/** Re-chequeo tras un evento del listener (expo-network / Android 13+). */
const LISTENER_RECHECK_DELAYS_MS = [400, 1_000] as const;

/**
 * Online solo si hay interfaz activa y, cuando Android ya lo validó, internet alcanzable.
 * `isInternetReachable === null/undefined` se trata como desconocido (no fuerza offline).
 */
function isOnlineFromState(state: Network.NetworkState): boolean {
  if (state.isConnected !== true) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

async function readIsOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return isOnlineFromState(state);
  } catch {
    return false;
  }
}

export function useNetwork() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const recheckTimers: ReturnType<typeof setTimeout>[] = [];

    function apply(online: boolean) {
      if (mounted) setIsConnected(online);
    }

    async function check() {
      apply(await readIsOnline());
    }

    function scheduleRechecks() {
      for (const timer of recheckTimers) clearTimeout(timer);
      recheckTimers.length = 0;

      for (const delay of LISTENER_RECHECK_DELAYS_MS) {
        recheckTimers.push(
          setTimeout(() => {
            void check();
          }, delay),
        );
      }
    }

    void check();

    const subscription = Network.addNetworkStateListener((state) => {
      // Aplicar de inmediato; en Android el evento puede mentir "online" tras desconectar.
      apply(isOnlineFromState(state));
      scheduleRechecks();
    });

    const interval = setInterval(() => {
      void check();
    }, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      subscription.remove();
      clearInterval(interval);
      for (const timer of recheckTimers) clearTimeout(timer);
    };
  }, []);

  return { isConnected };
}

export async function checkConnectivity(): Promise<boolean> {
  return readIsOnline();
}
