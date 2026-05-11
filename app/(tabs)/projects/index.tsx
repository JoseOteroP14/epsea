import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import { useAuthStore } from "@/store/useAuthStore";
import { ProjectStats, useProjectStore } from "@/store/useProjectStore";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import {
    ChevronRight,
    Folder,
    Search,
    Users,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface StatRowProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  loading?: boolean;
}

function StatRow({ icon, value, label, loading }: StatRowProps) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statIconContainer}>{icon}</View>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      <View style={styles.statValueContainer}>
        {loading ? (
          <ActivityIndicator size="small" color="#1a7a3a" />
        ) : (
          <ThemedText type="defaultSemiBold" style={styles.statValue}>
            {value}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

export default function ProjectsScreen() {
  const { projects, projectStats, loading, fetchProjects } = useProjectStore();
  const userId = useAuthStore((state) => state.user?.user_id);
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!userId) return;
    fetchProjects();
  }, [fetchProjects, userId]);

  const filteredProjects = projects.filter(
    (p) =>
      (p.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getProjectStats = (projectId: number): ProjectStats => {
    return (
      projectStats[projectId] || {
        totalProducers: 0,
        characterizedProducers: 0,
        loading: true,
      }
    );
  };

  const renderProjectItem = ({ item }: { item: any }) => {
    const stats = getProjectStats(item.id);

    return (
      <TouchableOpacity
        onPress={() =>
          router.push({
            pathname: "/projects/[id]",
            params: {
              id: String(item.id),
              name: item.name ?? "",
              description: item.description ?? "",
              type_id: item.type_id != null ? String(item.type_id) : "",
              role_name: item.role_name ?? "",
            },
          })
        }
        activeOpacity={0.7}
      >
        <BlurView intensity={20} tint="light" style={styles.projectCard}>
          <View style={styles.cardHeader}>
            <View style={styles.titleContainer}>
              <ThemedText
                type="subtitle"
                style={styles.projectTitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.name}
              </ThemedText>
            </View>
            <ChevronRight size={responsiveFont(20)} color="#1a7a3a" />
          </View>

          <View style={styles.statsContainer}>
            <StatRow
              icon={<Users size={responsiveFont(18)} color="#3498db" />}
              value={stats.totalProducers}
              label="Usuarios asignados"
              loading={stats.loading}
            />
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  return (
    <StandardView
      headerBackgroundColor={{ light: "#1a7a3a", dark: "#0a1a10" }}
      headerTitle="Proyectos"
      noScroll
    >
      <View style={styles.searchSection}>
        <View style={styles.searchInputContainer}>
          <Search size={responsiveFont(20)} color="#95a5a6" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#95a5a6"
          />
        </View>
      </View>

      {loading && projects.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1a7a3a" />
        </View>
      ) : (
        <FlatList
          data={filteredProjects}
          renderItem={renderProjectItem}
          keyExtractor={(item, index) => (item.id ?? index).toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchProjects}
              tintColor="#1a7a3a"
              colors={["#1a7a3a"]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Folder size={responsiveFont(64)} color="#e0e0e0" />
              <ThemedText style={styles.emptyText}>
                No se encontraron proyectos
              </ThemedText>
            </View>
          }
        />
      )}
    </StandardView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  searchSection: {
    paddingHorizontal: widthScale(8),
    paddingBottom: verticalScale(16),
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: widthScale(12),
    paddingHorizontal: widthScale(12),
    height: verticalScale(48),
  },
  searchInput: {
    flex: 1,
    marginLeft: widthScale(8),
    fontSize: responsiveFont(17),
    color: "#2c3e50",
  },
  listContent: {
    paddingHorizontal: widthScale(8),
    paddingBottom: verticalScale(100),
  },
  projectCard: {
    padding: widthScale(16),
    borderRadius: widthScale(16),
    backgroundColor: "rgba(255,255,255,0.7)",
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: verticalScale(12),
    paddingBottom: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  titleContainer: {
    flex: 1,
    marginRight: widthScale(12),
  },
  projectTitle: {
    fontSize: responsiveFont(18),
    fontWeight: "600",
  },
  statsContainer: {
    gap: verticalScale(10),
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(10),
  },
  statIconContainer: {
    width: widthScale(32),
    height: widthScale(32),
    borderRadius: widthScale(8),
    backgroundColor: "rgba(0,0,0,0.03)",
    justifyContent: "center",
    alignItems: "center",
  },
  statLabel: {
    flex: 1,
    fontSize: responsiveFont(17),
    color: "#2c3e50",
  },
  statValueContainer: {
    minWidth: widthScale(40),
    alignItems: "flex-end",
  },
  statValue: {
    fontSize: responsiveFont(17),
    color: "#2c3e50",
  },
  emptyContainer: {
    marginTop: verticalScale(100),
    alignItems: "center",
    opacity: 0.3,
  },
  emptyText: {
    marginTop: verticalScale(16),
    fontSize: responsiveFont(17),
  },
});
