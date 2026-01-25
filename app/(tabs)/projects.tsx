import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import { useAuthStore } from "@/store/useAuthStore";
import { useProjectStore } from "@/store/useProjectStore";
import {
  responsiveFont,
  verticalScale,
  widthScale
} from "@/utils/responsive";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import {
  Briefcase,
  ChevronRight,
  Folder,
  Plus,
  Search,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function ProjectsScreen() {
  const { projects, loading, fetchProjects } = useProjectStore();
  const { currentRole } = useAuthStore();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [newProject, setNewProject] = useState({
    nombre: "",
    id_mga: "",
  });

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filteredProjects = projects.filter(
    (p) =>
      p.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id_mga.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderProjectItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      onPress={() => router.push(`/project/${item.id}`)}
      activeOpacity={0.7}
    >
      <BlurView intensity={20} tint="light" style={styles.projectCard}>
        <View style={styles.cardHeader}>
          <View style={styles.iconContainer}>
            <Briefcase size={responsiveFont(22)} color="#2ecc71" />
          </View>
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>MGA: {item.id_mga}</ThemedText>
          </View>
        </View>

        <View style={styles.cardBody}>
          <ThemedText type="subtitle" style={styles.projectTitle} numberOfLines={2}>
            {item.nombre}
          </ThemedText>
          <ThemedText style={styles.projectDescription} numberOfLines={2}>
            {item.municipios || "Sin municipios asignados"}
          </ThemedText>
        </View>

        <View style={styles.cardFooter}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.footerText}>
              ID: {item.id}
            </ThemedText>
          </View>
          <ChevronRight size={responsiveFont(16)} color="#2ecc71" />
        </View>
      </BlurView>
    </TouchableOpacity>
  );

  return (
    <StandardView
      headerBackgroundColor={{ light: "#2ecc71", dark: "#0a1a10" }}
      headerTitle="Proyectos"
      noScroll
    >
      <View style={styles.searchSection}>
        <View style={styles.searchInputContainer}>
          <Search size={responsiveFont(20)} color="#95a5a6" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre o ID..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#95a5a6"
          />
        </View>
        {currentRole === 1 && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
          >
            <Plus size={responsiveFont(20)} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {loading && projects.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2ecc71" />
        </View>
      ) : (
        <FlatList
          data={filteredProjects}
          renderItem={renderProjectItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchProjects}
              tintColor="#2ecc71"
              colors={["#2ecc71"]}
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

      {/* Basic Create Modal Template */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={40} tint="dark" style={styles.modalContent}>
            <ThemedText type="subtitle" style={styles.modalTitle}>
              Nuevo Proyecto
            </ThemedText>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Nombre del Proyecto</ThemedText>
              <TextInput
                style={styles.input}
                value={newProject.nombre}
                onChangeText={(text) =>
                  setNewProject({ ...newProject, nombre: text })
                }
                placeholder="Ej: Siembra de Maíz"
                placeholderTextColor="#95a5a6"
              />

              <ThemedText style={styles.label}>ID MGA</ThemedText>
              <TextInput
                style={styles.input}
                value={newProject.id_mga}
                onChangeText={(text) =>
                  setNewProject({ ...newProject, id_mga: text })
                }
                placeholder="Ej: 2024-001"
                placeholderTextColor="#95a5a6"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setModalVisible(false)}
              >
                <ThemedText style={styles.cancelBtnText}>Cancelar</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={() => {
                  /* TODO: Implement API create */
                  setModalVisible(false);
                }}
              >
                <ThemedText style={styles.saveBtnText}>Crear</ThemedText>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>
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
    flexDirection: "row",
    paddingHorizontal: widthScale(20),
    paddingBottom: verticalScale(16),
    gap: widthScale(12),
    alignItems: "center",
  },
  searchInputContainer: {
    flex: 1,
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
    fontSize: responsiveFont(14),
    color: "#2c3e50",
  },
  addButton: {
    width: widthScale(48),
    height: widthScale(48),
    borderRadius: widthScale(12),
    backgroundColor: "#2ecc71",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#2ecc71",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  listContent: {
    paddingHorizontal: widthScale(20),
    paddingBottom: verticalScale(100),
  },
  projectCard: {
    padding: widthScale(16),
    borderRadius: widthScale(16),
    backgroundColor: "rgba(255,255,255,0.7)",
    marginBottom: verticalScale(16),
    gap: widthScale(10),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconContainer: {
    width: widthScale(40),
    height: widthScale(40),
    borderRadius: widthScale(10),
    backgroundColor: "rgba(46, 204, 113, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    backgroundColor: "rgba(46, 204, 113, 0.15)",
    paddingHorizontal: widthScale(10),
    paddingVertical: verticalScale(4),
    borderRadius: widthScale(8),
  },
  badgeText: {
    fontSize: responsiveFont(11),
    color: "#2ecc71",
    fontWeight: "800",
  },
  cardBody: {
    gap: verticalScale(4),
  },
  projectTitle: {
    fontSize: responsiveFont(18),
  },
  projectDescription: {
    fontSize: responsiveFont(13),
    opacity: 0.6,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    paddingTop: verticalScale(12),
  },
  footerText: {
    fontSize: responsiveFont(12),
    opacity: 0.4,
  },
  emptyContainer: {
    marginTop: verticalScale(100),
    alignItems: "center",
    opacity: 0.3,
  },
  emptyText: {
    marginTop: verticalScale(16),
    fontSize: responsiveFont(16),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: widthScale(20),
  },
  modalContent: {
    backgroundColor: "rgba(255,255,255,1)",
    padding: widthScale(24),
    borderRadius: widthScale(30),
    overflow: "hidden",
  },
  modalTitle: {
    textAlign: "center",
    marginBottom: verticalScale(24),
  },
  formGroup: {
    gap: verticalScale(16),
  },
  label: {
    fontSize: responsiveFont(14),
    fontWeight: "600",
    color: "#2c3e50",
  },
  input: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: widthScale(12),
    padding: widthScale(16),
    marginBottom: verticalScale(16),
    fontSize: responsiveFont(16),
  },
  modalActions: {
    flexDirection: "row",
    gap: widthScale(12),
    marginTop: verticalScale(12),
  },
  modalBtn: {
    flex: 1,
    padding: verticalScale(14),
    borderRadius: widthScale(12),
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "#ecf0f1",
  },
  cancelBtnText: {
    color: "#7f8c8d",
    fontWeight: "bold",
  },
  saveBtn: {
    backgroundColor: "#2ecc71",
  },
  saveBtnText: {
    color: "white",
    fontWeight: "bold",
  },
});
