import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAlert } from "@/components/ui/custom-alert";
import { useAuthStore } from "@/store/useAuthStore";
import { useProjectStore } from "@/store/useProjectStore";
import { responsiveFont, verticalScale, widthScale } from '@/utils/responsive';
import { useRouter } from "expo-router";
import { Briefcase, LogOut } from "lucide-react-native";
import React, { useEffect } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

function getFirstWord(value?: string | null): string {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return cleaned.split(" ")[0] ?? "";
}

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
        <ThemedView style={styles.statCard}>
          <Briefcase size={responsiveFont(20)} color="#2ecc71" />
          <ThemedText type="defaultSemiBold">{projects.length}</ThemedText>
          <ThemedText style={styles.statLabel}>Proyectos Asignados</ThemedText>
        </ThemedView>
      </View>
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
    marginBottom: verticalScale(30),
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
