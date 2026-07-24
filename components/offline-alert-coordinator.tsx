import { useAlert } from "@/components/ui/custom-alert";
import { useNetwork } from "@/hooks/use-network";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect, useRef } from "react";

const OFFLINE_ALERT = {
  title: "Sin conexión a internet",
  message:
    "En este momento no hay conexión a internet. Puede seguir trabajando con normalidad.\n\nImportante: solo se enviará al sincronizar lo que usted guarde tocando el botón Guardar. Si escribe algo y no lo guarda, eso no se enviará cuando vuelva el internet.",
  type: "warning" as const,
  buttons: [{ text: "Entendido" }],
};

/**
 * Alerta global (raíz de la app) al abrir sin internet o al perder la conexión.
 * No depende de un tab concreto.
 */
export function OfflineAlertCoordinator() {
  const { isConnected } = useNetwork();
  const { showAlert } = useAlert();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const notifiedForThisOfflineRef = useRef(false);

  useEffect(() => {
    if (!isHydrated || isConnected === null) return;

    if (isConnected) {
      notifiedForThisOfflineRef.current = false;
      return;
    }

    // Offline: avisar una vez por cada periodo sin conexión
    if (!isAuthenticated) return;
    if (notifiedForThisOfflineRef.current) return;

    notifiedForThisOfflineRef.current = true;
    showAlert(OFFLINE_ALERT);
  }, [isConnected, isAuthenticated, isHydrated, showAlert]);

  return null;
}
