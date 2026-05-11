import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAlert } from "@/components/ui/custom-alert";
import { useNetwork } from "@/hooks/use-network";
import { useSyncStore } from "@/store/useSyncStore";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  RefreshCw,
} from "lucide-react-native";
import { useFocusEffect } from "expo-router";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SyncScreen() {
  const {
    isDownloading,
    isUploading,
    progress,
    pendingUploads,
    lastDownload,
    lastUpload,
    error,
    startFullSync,
    refreshStatus,
  } = useSyncStore();

  const { isConnected } = useNetwork();
  const { showAlert } = useAlert();
  const isBusy = isDownloading || isUploading;

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
    }, [refreshStatus]),
  );

  const handleSync = useCallback(async () => {
    if (!isConnected) {
      showAlert({
        title: "Sin conexión",
        message: "Necesitas conexión a internet para sincronizar.",
        type: "warning",
      });
      return;
    }
    try {
      const r = await startFullSync();
      const parts: string[] = [];
      if (r.uploaded > 0 || r.failed > 0) {
        parts.push(
          `${r.uploaded} elemento(s) enviado(s) al servidor${r.failed ? `, ${r.failed} con error` : ""}.`,
        );
      }
      if (r.downloadCompleted) {
        if (r.fullDownloadRan) {
          parts.push("Se descargaron los datos más recientes del servidor.");
        } else if (r.selectiveRefreshRan) {
          parts.push(
            "La copia local se alineó solo con lo que enviaste (sin volver a descargar proyectos ni el resto de productores).",
          );
        } else if (r.downloadRanAfterUpload) {
          parts.push("La copia local se actualizó tras enviar los pendientes.");
        }
      }
      showAlert({
        title: "Sincronización completada",
        message:
          parts.length > 0
            ? parts.join(" ")
            : "No hubo envíos ni descarga en esta ejecución.",
        type: "success",
      });
    } catch (e) {
      showAlert({
        title: "Error",
        message: e instanceof Error ? e.message : "Error durante la sincronización",
        type: "error",
      });
    }
  }, [isConnected, startFullSync, showAlert]);

  return (
    <StandardView
      headerBackgroundColor={{ light: "#1a7a3a", dark: "#0a1a10" }}
      headerTitle="Sincronizar"
    >
      {/* Connection status */}
      <ThemedView style={styles.statusCard}>
        <View style={styles.statusRow}>
          {isConnected ? (
            <Cloud size={responsiveFont(20)} color="#1a7a3a" />
          ) : (
            <CloudOff size={responsiveFont(20)} color="#e74c3c" />
          )}
          <ThemedText type="defaultSemiBold">
            {isConnected === null
              ? "Verificando conexion..."
              : isConnected
                ? "Conectado"
                : "Sin conexion"}
          </ThemedText>
        </View>
      </ThemedView>

      {/* Progress */}
      {isBusy && progress && (
        <ThemedView style={styles.progressCard}>
          <ActivityIndicator size="small" color="#1a7a3a" />
          <ThemedText style={styles.progressText}>
            {progress.stage}
          </ThemedText>
          {progress.total > 0 && (
            <ThemedText style={styles.progressCounter}>
              {progress.current}/{progress.total}
            </ThemedText>
          )}
        </ThemedView>
      )}

      {/* Error */}
      {error && (
        <ThemedView style={styles.errorCard}>
          <AlertCircle size={responsiveFont(18)} color="#e74c3c" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </ThemedView>
      )}

      <TouchableOpacity
        style={[styles.actionButton, isBusy && styles.actionButtonDisabled]}
        onPress={handleSync}
        disabled={isBusy || !isConnected}
        activeOpacity={0.8}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <RefreshCw size={responsiveFont(22)} color="#ffffff" />
        )}
        <View style={styles.actionTextContainer}>
          <ThemedText
            lightColor="#ffffff"
            darkColor="#ffffff"
            type="defaultSemiBold"
            style={styles.actionTitle}
          >
            Sincronizar
          </ThemedText>
          <ThemedText
            lightColor="rgba(255,255,255,0.7)"
            darkColor="rgba(255,255,255,0.7)"
            style={styles.actionSubtitle}
          >
            {isBusy && progress?.stage
              ? progress.stage
              : pendingUploads > 0
                ? `Primero sube ${pendingUploads} pendiente${pendingUploads !== 1 ? "s" : ""}, luego descarga del servidor.`
                : "Sin pendientes: solo se descargan datos del servidor."}
          </ThemedText>
        </View>
      </TouchableOpacity>

      {/* Metadata */}
      <ThemedView style={styles.metadataCard}>
        <ThemedText type="defaultSemiBold" style={styles.metadataTitle}>
          Historial
        </ThemedText>

        <View style={styles.metadataRow}>
          <Clock size={responsiveFont(16)} color="#7f8c8d" />
          <ThemedText style={styles.metadataLabel}>
            Ultima descarga:
          </ThemedText>
          <ThemedText style={styles.metadataValue}>
            {formatDate(lastDownload)}
          </ThemedText>
        </View>

        <View style={styles.metadataRow}>
          <Clock size={responsiveFont(16)} color="#7f8c8d" />
          <ThemedText style={styles.metadataLabel}>
            Ultima subida:
          </ThemedText>
          <ThemedText style={styles.metadataValue}>
            {formatDate(lastUpload)}
          </ThemedText>
        </View>

        <View style={styles.metadataRow}>
          {pendingUploads === 0 ? (
            <CheckCircle2 size={responsiveFont(16)} color="#1a7a3a" />
          ) : (
            <RefreshCw size={responsiveFont(16)} color="#f39c12" />
          )}
          <ThemedText style={styles.metadataLabel}>
            Pendientes:
          </ThemedText>
          <ThemedText
            style={[
              styles.metadataValue,
              pendingUploads > 0 && { color: "#f39c12", fontWeight: "600" },
            ]}
          >
            {pendingUploads}
          </ThemedText>
        </View>
      </ThemedView>
    </StandardView>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: widthScale(14),
    borderRadius: widthScale(12),
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(10),
  },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: widthScale(14),
    borderRadius: widthScale(12),
    backgroundColor: "rgba(26, 122, 58,0.08)",
    gap: widthScale(10),
  },
  progressText: {
    flex: 1,
    fontSize: responsiveFont(17),
  },
  progressCounter: {
    fontSize: responsiveFont(17),
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: widthScale(14),
    borderRadius: widthScale(12),
    backgroundColor: "rgba(231,76,60,0.08)",
    gap: widthScale(10),
  },
  errorText: {
    flex: 1,
    fontSize: responsiveFont(17),
    color: "#e74c3c",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: widthScale(18),
    borderRadius: widthScale(14),
    backgroundColor: "#1a7a3a",
    gap: widthScale(14),
  },
  actionButtonDisabled: {
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: responsiveFont(17),
  },
  actionSubtitle: {
    fontSize: responsiveFont(17),
    marginTop: verticalScale(2),
  },
  metadataCard: {
    padding: widthScale(16),
    borderRadius: widthScale(12),
    backgroundColor: "rgba(0,0,0,0.03)",
    gap: verticalScale(10),
  },
  metadataTitle: {
    fontSize: responsiveFont(17),
    marginBottom: verticalScale(4),
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(8),
  },
  metadataLabel: {
    fontSize: responsiveFont(17),
  },
  metadataValue: {
    fontSize: responsiveFont(17),
  },
});
