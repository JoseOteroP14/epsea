import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAlert } from "@/components/ui/custom-alert";
import { useAuthStore } from "@/store/useAuthStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useSyncStore } from "@/store/useSyncStore";
import { responsiveFont, verticalScale, widthScale } from '@/utils/responsive';
import { useRouter } from "expo-router";
import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  CloudDownload,
  LogOut,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

function getFirstWord(value?: string | null): string {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return cleaned.split(" ")[0] ?? "";
}

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

/* ─────────── Animated progress bar component ─────────── */
function ProgressBar({ progress }: { progress: number }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(Math.min(progress, 1) * 100, {
      duration: 400,
      easing: Easing.out(Easing.ease),
    });
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={progressStyles.track}>
      <Animated.View style={[progressStyles.fill, barStyle]} />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(26,122,58,0.12)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#1a7a3a",
  },
});

/* ─────────── Sync progress card ─────────── */
function SyncProgressCard() {
  const {
    isDownloading,
    progress,
    lastDownload,
    error,
  } = useSyncStore();

  // Show "done" state for a few seconds after download completes
  const [showDone, setShowDone] = useState(false);
  const [wasPreviouslyDownloading, setWasPreviouslyDownloading] = useState(false);

  useEffect(() => {
    if (isDownloading) {
      setWasPreviouslyDownloading(true);
      setShowDone(false);
    } else if (wasPreviouslyDownloading && !error) {
      setShowDone(true);
      setWasPreviouslyDownloading(false);
      const timer = setTimeout(() => setShowDone(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [isDownloading, error]);

  // Don't render if nothing is happening and there's no error
  if (!isDownloading && !showDone && !error) return null;

  const pct = progress && progress.total > 0
    ? progress.current / progress.total
    : 0;
  const pctLabel = `${Math.round(pct * 100)}%`;

  // Error state
  if (error && !isDownloading) {
    return (
      <ThemedView style={syncStyles.card}>
        <View style={syncStyles.headerRow}>
          <AlertCircle size={responsiveFont(18)} color="#e74c3c" />
          <ThemedText style={syncStyles.titleError}>
            Error de sincronización
          </ThemedText>
        </View>
        <ThemedText style={syncStyles.errorText}>{error}</ThemedText>
      </ThemedView>
    );
  }

  // Done state
  if (showDone) {
    return (
      <ThemedView style={syncStyles.card}>
        <View style={syncStyles.headerRow}>
          <CheckCircle2 size={responsiveFont(18)} color="#1a7a3a" />
          <ThemedText style={syncStyles.titleDone}>
            Datos sincronizados
          </ThemedText>
        </View>
        <ThemedText style={syncStyles.subtitle}>
          Última descarga: {formatDate(lastDownload)}
        </ThemedText>
      </ThemedView>
    );
  }

  // Downloading state
  return (
    <ThemedView style={syncStyles.card}>
      <View style={syncStyles.headerRow}>
        <CloudDownload size={responsiveFont(18)} color="#1a7a3a" />
        <ThemedText type="defaultSemiBold" style={syncStyles.titleDownloading}>
          Descargando datos...
        </ThemedText>
        <ThemedText style={syncStyles.pctLabel}>{pctLabel}</ThemedText>
      </View>
      <ProgressBar progress={pct} />
      {progress && (
        <ThemedText style={syncStyles.stageText}>
          {progress.stage}
          {progress.total > 0
            ? ` (${progress.current}/${progress.total})`
            : ""}
        </ThemedText>
      )}
      <View style={syncStyles.warningBox}>
        <View style={syncStyles.warningHeader}>
          <AlertTriangle size={responsiveFont(16)} color="#ca8a04" />
          <Text style={syncStyles.warningTitle}>Advertencia</Text>
        </View>
        <Text style={syncStyles.warningBody}>
          Espere al menos{" "}
          <Text style={syncStyles.warningHighlight}>10 segundos</Text>
          {" "}con la app abierta antes de{" "}
          <Text style={syncStyles.warningHighlight}>cambiar de aplicación</Text>
          . Así se evita que Android bloquee la sincronización en segundo plano.
        </Text>
      </View>
    </ThemedView>
  );
}

const syncStyles = StyleSheet.create({
  card: {
    padding: widthScale(14),
    borderRadius: widthScale(14),
    backgroundColor: "rgba(26,122,58,0.05)",
    borderWidth: 1,
    borderColor: "rgba(26,122,58,0.12)",
    gap: verticalScale(8),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(8),
  },
  titleDownloading: {
    flex: 1,
    fontSize: responsiveFont(14),
    color: "#1a7a3a",
  },
  titleDone: {
    flex: 1,
    fontSize: responsiveFont(14),
    fontWeight: "600",
    color: "#1a7a3a",
  },
  titleError: {
    flex: 1,
    fontSize: responsiveFont(14),
    fontWeight: "600",
    color: "#e74c3c",
  },
  pctLabel: {
    fontSize: responsiveFont(13),
    fontWeight: "700",
    color: "#1a7a3a",
  },
  stageText: {
    fontSize: responsiveFont(12),
    color: "#11181C",
    fontWeight: "600",
  },
  warningBox: {
    marginTop: verticalScale(2),
    padding: widthScale(10),
    borderRadius: widthScale(10),
    backgroundColor: "rgba(234, 179, 8, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(202, 138, 4, 0.45)",
    gap: verticalScale(6),
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(6),
  },
  warningTitle: {
    fontSize: responsiveFont(13),
    fontWeight: "800",
    color: "#11181C",
  },
  warningBody: {
    fontSize: responsiveFont(12),
    lineHeight: responsiveFont(17),
    fontWeight: "700",
    color: "#11181C",
  },
  warningHighlight: {
    fontWeight: "800",
    color: "#ca8a04",
  },
  subtitle: {
    fontSize: responsiveFont(12),
    color: "rgba(0,0,0,0.45)",
  },
  errorText: {
    fontSize: responsiveFont(12),
    color: "#e74c3c",
  },
});

/* ─────────── Home screen ─────────── */
export default function HomeScreen() {
  const { projects, fetchProjects } = useProjectStore();
  const { logout } = useAuthStore();
  const user = useAuthStore((state) => state.user);
  const { showAlert } = useAlert();
  const router = useRouter();

  const firstName = getFirstWord(user?.first_name);
  const firstSurname = getFirstWord(user?.last_name);
  const extensionistDisplayName =
    [firstName, firstSurname].filter(Boolean).join(" ").trim() ||
    "Extensionista";

  useEffect(() => {
    if (!user?.user_id) return;
    fetchProjects();
  }, [fetchProjects, user?.user_id]);

  const handleLogout = () => {
    showAlert({
      title: "Cerrar Sesión",
      message: "¿Estás seguro de que deseas cerrar sesión?",
      type: "warning",
      buttons: [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar Sesión",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/login");
          },
        },
      ],
    });
  };

  return (
    <StandardView
      headerBackgroundColor={{
        light: "#1a7a3a",
        dark: "#0a1a10"
      }}
      headerTitle={extensionistDisplayName}
      centerContentVertical
      headerImage={
        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            style={styles.headerLogoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
          >
            <LogOut size={responsiveFont(15)} color="#ffffff" />
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.statsRow}>
        <TouchableOpacity
          style={styles.statCard}
          onPress={() => router.push("/projects")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Ver proyectos asignados"
        >
          <Briefcase size={responsiveFont(20)} color="#2ecc71" />
          <ThemedText type="defaultSemiBold">{projects.length}</ThemedText>
          <ThemedText style={styles.statLabel}>Proyectos Asignados</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Sync progress card — visible during/after background download */}
      <SyncProgressCard />
    </StandardView>
  );
}

const styles = StyleSheet.create({
  headerActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  headerLogoutButton: {
    width: widthScale(32),
    height: widthScale(32),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: widthScale(16),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  statsRow: {
    flexDirection: 'row',
    gap: widthScale(12),
    marginBottom: verticalScale(16),
  },
  statCard: {
    flex: 1,
    padding: widthScale(16),
    borderRadius: widthScale(16),
    backgroundColor: 'rgba(0,0,0,0.03)',
    alignItems: 'center',
    gap: verticalScale(4),
  },
  statLabel: {
    fontSize: responsiveFont(14),
  },
});
