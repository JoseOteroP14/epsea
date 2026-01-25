import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { USER_ROLES } from "@/schemas/auth";
import { useAuthStore } from "@/store/useAuthStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useProjectStore } from "@/store/useProjectStore";
import { responsiveFont, verticalScale, widthScale } from '@/utils/responsive';
import { Bell, Briefcase, Sparkles } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

export default function HomeScreen() {
  const { projects } = useProjectStore();
  const { notifications } = useNotificationStore();
  const { currentRole, isAuthenticated, user } = useAuthStore();

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <StandardView
      headerBackgroundColor={{
        light: currentRole === USER_ROLES.ADMIN ? "#2ecc71" : "#3498db",
        dark: "#0a1a10"
      }}
      headerTitle={currentRole === USER_ROLES.ADMIN ? "Admin EPSEA" : "Extensionista"}
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title" style={{ flex: 1 }} numberOfLines={2}>
          {isAuthenticated ? `¡Hola, ${user?.username || 'Usuario'}!` : 'Bienvenido'}
        </ThemedText>
        <Sparkles size={responsiveFont(28)} color={currentRole === USER_ROLES.ADMIN ? "#2ecc71" : "#3498db"} />
      </ThemedView>

      <ThemedView style={styles.welcomeContainer}>
        <ThemedText>
          {currentRole === USER_ROLES.ADMIN
            ? "Gestión global del sistema EPSEA. Aquí puedes supervisar proyectos y usuarios."
            : "Registro de actividades y asistencia técnica para productores agropecuarios."}
        </ThemedText>
      </ThemedView>

      <View style={styles.statsRow}>
        <ThemedView style={styles.statCard}>
          <Briefcase size={responsiveFont(20)} color="#2ecc71" />
          <ThemedText type="defaultSemiBold">{projects.length}</ThemedText>
          <ThemedText style={styles.statLabel}>Proyectos</ThemedText>
        </ThemedView>

        <ThemedView style={styles.statCard}>
          <Bell size={responsiveFont(20)} color="#2ecc71" />
          <ThemedText type="defaultSemiBold">{unreadCount}</ThemedText>
          <ThemedText style={styles.statLabel}>Avisos</ThemedText>
        </ThemedView>
      </View>
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
  welcomeContainer: {
    marginBottom: verticalScale(20),
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
    opacity: 0.6,
  },
});
