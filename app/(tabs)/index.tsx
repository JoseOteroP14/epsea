import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useNetwork } from "@/hooks/use-network";
import { useAuthStore } from "@/store/useAuthStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useSyncStore } from "@/store/useSyncStore";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
  Briefcase,
  Cloud,
  CloudOff,
  Clock,
  LogOut,
  RefreshCw,
  Users,
  ClipboardCheck,
  ClipboardList,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

export default function HomeScreen() {
  const { projects, projectStats, fetchProjects } = useProjectStore();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { pendingUploads, lastDownload, isDownloading, progress, startDownload, refreshStatus } = useSyncStore();
  const { isConnected } = useNetwork();

  const handleLogout = useCallback(() => {
    Alert.alert("Cerrar sesion", "¿Estas seguro que deseas cerrar sesion?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesion", style: "destructive", onPress: () => logout() },
    ]);
  }, [logout]);

  useEffect(() => {
    fetchProjects();
    refreshStatus();
  }, [fetchProjects, refreshStatus]);

  // Re-fetch projects from store when a background download completes
  const prevIsDownloading = useRef(false);
  useEffect(() => {
    if (prevIsDownloading.current && !isDownloading) {
      fetchProjects();
      refreshStatus();
    }
    prevIsDownloading.current = isDownloading;
  }, [isDownloading, fetchProjects, refreshStatus]);

  // Auto-sync when app comes to foreground and data is stale (> 8 hours)
  const SYNC_TTL_MS = 8 * 60 * 60 * 1000;
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState !== "active") return;
      const { isDownloading: syncing, lastDownload: last } =
        useSyncStore.getState();
      if (syncing) return;
      if (!isConnected) return;
      const stale =
        !last || Date.now() - new Date(last).getTime() > SYNC_TTL_MS;
      if (stale) {
        startDownload().catch(console.error);
      }
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [isConnected, startDownload, SYNC_TTL_MS]);

  // Aggregate stats across all projects
  const aggregated = useMemo(() => {
    let totalProducers = 0;
    let characterizedProducers = 0;
    let statsLoading = false;

    for (const project of projects) {
      const stats = projectStats[project.id];
      if (stats) {
        totalProducers += stats.totalProducers;
        characterizedProducers += stats.characterizedProducers;
        if (stats.loading) statsLoading = true;
      }
    }

    const pendingCharacterization = totalProducers - characterizedProducers;

    return {
      totalProducers,
      characterizedProducers,
      pendingCharacterization:
        pendingCharacterization > 0 ? pendingCharacterization : 0,
      statsLoading,
    };
  }, [projects, projectStats]);

  const formatLastSync = (iso: string | null): string => {
    if (!iso) return "Sin sincronizar";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Hace un momento";
    if (diffMins < 60) return `Hace ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays}d`;
  };

  return (
    <StandardView
      headerBackgroundColor={{
        light: "#1a7a3a",
        dark: "#0a1a10",
      }}
      headerTitle="Extensionista"
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title" style={{ flex: 1 }} numberOfLines={2}>
          {isAuthenticated
            ? `¡Hola, ${user?.username || "Usuario"}!`
            : "Bienvenido"}
        </ThemedText>
        {isAuthenticated && (
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <LogOut size={responsiveFont(22)} color="#e74c3c" />
          </TouchableOpacity>
        )}
      </ThemedView>

      <ThemedView style={styles.welcomeContainer}>
        <ThemedText>
          Registro de actividades y asistencia tecnica para productores
          agropecuarios.
        </ThemedText>
      </ThemedView>

      {/* Connection status pill */}
      <View style={styles.connectionRow}>
        {isConnected ? (
          <View style={styles.connectionPill}>
            <Cloud size={responsiveFont(17)} color="#1a7a3a" />
            <ThemedText style={styles.connectionText}>Conectado</ThemedText>
          </View>
        ) : (
          <View style={[styles.connectionPill, styles.connectionOffline]}>
            <CloudOff size={responsiveFont(17)} color="#e74c3c" />
            <ThemedText style={[styles.connectionText, { color: "#e74c3c" }]}>
              Sin conexion
            </ThemedText>
          </View>
        )}
      </View>

      {/* Background sync banner */}
      {isDownloading && (
        <View style={styles.syncBanner}>
          <ActivityIndicator size="small" color="#fff" />
          <ThemedText
            lightColor="#fff"
            darkColor="#fff"
            style={styles.syncBannerText}
          >
            {progress?.stage ?? "Actualizando datos..."}
          </ThemedText>
        </View>
      )}

      {/* Main stats grid */}
      <View style={styles.statsGrid}>
        <ThemedView style={styles.statCard}>
          <Briefcase size={responsiveFont(22)} color="#1a7a3a" />
          <ThemedText type="defaultSemiBold" style={styles.statValue}>
            {projects.length}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Proyectos Asignados</ThemedText>
        </ThemedView>

        <ThemedView style={styles.statCard}>
          <Users size={responsiveFont(22)} color="#3498db" />
          <ThemedText type="defaultSemiBold" style={styles.statValue}>
            {aggregated.totalProducers}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Productores Totales</ThemedText>
        </ThemedView>
      </View>

      <View style={styles.statsGrid}>
        <ThemedView style={[styles.statCard, styles.statCardSuccess]}>
          <ClipboardCheck size={responsiveFont(22)} color="#156b33" />
          <ThemedText type="defaultSemiBold" style={styles.statValue}>
            {aggregated.characterizedProducers}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Caracterizados</ThemedText>
        </ThemedView>

        <ThemedView style={[styles.statCard, styles.statCardWarning]}>
          <ClipboardList size={responsiveFont(22)} color="#f39c12" />
          <ThemedText type="defaultSemiBold" style={styles.statValue}>
            {aggregated.pendingCharacterization}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Pendientes</ThemedText>
        </ThemedView>
      </View>

      {/* Sync info */}
      <ThemedView style={styles.syncCard}>
        <View style={styles.syncRow}>
          <Clock size={responsiveFont(18)} color="#7f8c8d" />
          <ThemedText style={styles.syncLabel}>
            Ultima sincronizacion:
          </ThemedText>
          <ThemedText type="defaultSemiBold" style={styles.syncValue}>
            {formatLastSync(lastDownload)}
          </ThemedText>
        </View>
        {pendingUploads > 0 && (
          <View style={styles.syncRow}>
            <RefreshCw size={responsiveFont(18)} color="#f39c12" />
            <ThemedText style={styles.syncLabel}>
              Respuestas por subir:
            </ThemedText>
            <ThemedText
              type="defaultSemiBold"
              style={[styles.syncValue, { color: "#f39c12" }]}
            >
              {pendingUploads}
            </ThemedText>
          </View>
        )}
      </ThemedView>
    </StandardView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(12),
    marginTop: verticalScale(8),
  },
  logoutButton: {
    width: widthScale(40),
    height: widthScale(40),
    borderRadius: widthScale(20),
    backgroundColor: "rgba(231, 76, 60, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  welcomeContainer: {
    marginBottom: verticalScale(12),
  },
  connectionRow: {
    flexDirection: "row",
    marginBottom: verticalScale(16),
  },
  connectionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(6),
    backgroundColor: "rgba(26, 122, 58,0.1)",
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(6),
    borderRadius: widthScale(20),
  },
  connectionOffline: {
    backgroundColor: "rgba(231,76,60,0.1)",
  },
  connectionText: {
    fontSize: responsiveFont(17),
    fontWeight: "600",
    color: "#1a7a3a",
  },
  statsGrid: {
    flexDirection: "row",
    gap: widthScale(12),
    marginBottom: verticalScale(12),
  },
  statCard: {
    flex: 1,
    padding: widthScale(16),
    borderRadius: widthScale(16),
    backgroundColor: "rgba(0,0,0,0.03)",
    alignItems: "center",
    gap: verticalScale(6),
  },
  statCardSuccess: {
    backgroundColor: "rgba(26, 122, 58,0.06)",
  },
  statCardWarning: {
    backgroundColor: "rgba(243,156,18,0.06)",
  },
  statValue: {
    fontSize: responsiveFont(28),
  },
  statLabel: {
    fontSize: responsiveFont(17),
    textAlign: "center",
  },
  syncBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(8),
    backgroundColor: "#1a7a3a",
    borderRadius: widthScale(10),
    paddingVertical: verticalScale(8),
    paddingHorizontal: widthScale(14),
    marginBottom: verticalScale(14),
  },
  syncBannerText: {
    fontSize: responsiveFont(13),
    fontWeight: "600",
    flexShrink: 1,
  },
  syncCard: {
    padding: widthScale(16),
    borderRadius: widthScale(16),
    backgroundColor: "rgba(0,0,0,0.03)",
    gap: verticalScale(10),
    marginBottom: verticalScale(20),
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(8),
  },
  syncLabel: {
    fontSize: responsiveFont(17),
    flex: 1,
  },
  syncValue: {
    fontSize: responsiveFont(17),
  },
});
