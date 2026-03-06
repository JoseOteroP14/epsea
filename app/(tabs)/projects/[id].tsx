import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import { InfoPopover } from "@/components/ui/info-popover";
import { useProducerStore } from "@/store/useProducerStore";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  Search,
  User as UserIcon,
  Users,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { Producer } from "@/schemas/producer";

export default function ProjectDetailScreen() {
  const { id, name, description } = useLocalSearchParams<{
    id: string;
    name: string;
    description: string;
  }>();
  const router = useRouter();

  const {
    producers,
    loading,
    searchQuery,
    pagination,
    fetchProducers,
    setSearchQuery,
    resetState,
  } = useProducerStore();

  useEffect(() => {
    fetchProducers(id);
    return () => resetState();
  }, [id]);

  const getFullName = (p: Producer) =>
    [p.first_name, p.middle_name, p.first_surname, p.last_surname]
      .filter(Boolean)
      .join(" ");

  const filteredProducers = useMemo(() => {
    if (!searchQuery.trim()) return producers;
    const q = searchQuery.toLowerCase();
    return producers.filter(
      (p) =>
        getFullName(p).toLowerCase().includes(q) ||
        p.identification.toLowerCase().includes(q),
    );
  }, [producers, searchQuery]);

  const goToPage = useCallback(
    (page: number) => {
      fetchProducers(id, page, pagination.limit);
    },
    [id, pagination.limit],
  );

  const renderProducerRow = useCallback(
    ({ item }: { item: Producer }) => {
      // La API puede devolver 'id' o 'producer_id' según el endpoint
      const producerId = item.producer_id ?? item.id;

      return (
        <TouchableOpacity
          style={styles.producerRow}
          activeOpacity={0.6}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/projects/producer/[producerId]",
              params: {
                producerId: producerId,
                projectId: id,
                projectName: name ?? "",
              },
            })
          }
        >
          <View style={styles.avatarCircle}>
            <UserIcon size={responsiveFont(18)} color="#1a7a3a" />
          </View>
          <View style={styles.rowInfo}>
            <ThemedText
              type="defaultSemiBold"
              style={styles.rowName}
              numberOfLines={1}
            >
              {getFullName(item)}
            </ThemedText>
            <ThemedText style={styles.rowId} numberOfLines={1}>
              CC: {item.identification}
            </ThemedText>
          </View>
          <ChevronRight size={responsiveFont(18)} color="#11181C" />
        </TouchableOpacity>
      );
    },
    [router, name, id],
  );

  const ListHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.projectHeader}>
          <View style={styles.projectIconContainer}>
            <Folder size={responsiveFont(24)} color="#1a7a3a" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText
              type="subtitle"
              style={styles.projectName}
              numberOfLines={2}
            >
              {name}
            </ThemedText>
          </View>
          {description ? (
            <InfoPopover
              title="Descripción del Proyecto"
              content={description}
            />
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <Users size={responsiveFont(20)} color="#1a7a3a" />
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Productores ({pagination.totalCount})
          </ThemedText>
        </View>

        <View style={styles.searchContainer}>
          <Search size={responsiveFont(18)} color="#95a5a6" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre o cédula..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#95a5a6"
          />
        </View>
      </View>
    ),
    [name, description, searchQuery, pagination.totalCount, router],
  );

  const ListFooter = useMemo(() => {
    if (pagination.totalPages <= 1) return null;
    return (
      <View style={styles.paginationContainer}>
        <TouchableOpacity
          style={[
            styles.pageButton,
            pagination.currentPage <= 1 && styles.pageButtonDisabled,
          ]}
          onPress={() => goToPage(pagination.currentPage - 1)}
          disabled={pagination.currentPage <= 1}
        >
          <ChevronLeft
            size={responsiveFont(16)}
            color={pagination.currentPage <= 1 ? "#bdc3c7" : "#1a7a3a"}
          />
          <ThemedText
            style={[
              styles.pageButtonText,
              pagination.currentPage <= 1 && styles.pageButtonTextDisabled,
            ]}
          >
            Anterior
          </ThemedText>
        </TouchableOpacity>

        <ThemedText style={styles.pageIndicator}>
          {pagination.currentPage} / {pagination.totalPages}
        </ThemedText>

        <TouchableOpacity
          style={[
            styles.pageButton,
            pagination.currentPage >= pagination.totalPages &&
              styles.pageButtonDisabled,
          ]}
          onPress={() => goToPage(pagination.currentPage + 1)}
          disabled={pagination.currentPage >= pagination.totalPages}
        >
          <ThemedText
            style={[
              styles.pageButtonText,
              pagination.currentPage >= pagination.totalPages &&
                styles.pageButtonTextDisabled,
            ]}
          >
            Siguiente
          </ThemedText>
          <ChevronRight
            size={responsiveFont(16)}
            color={
              pagination.currentPage >= pagination.totalPages
                ? "#bdc3c7"
                : "#1a7a3a"
            }
          />
        </TouchableOpacity>
      </View>
    );
  }, [pagination, goToPage]);

  return (
    <StandardView
      headerBackgroundColor={{ light: "#1a7a3a", dark: "#0a1a10" }}
      headerTitle="Proyecto"
      noScroll
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1a7a3a" />
        </View>
      ) : (
        <FlatList
          data={filteredProducers}
          renderItem={renderProducerRow}
          keyExtractor={(item, index) =>
            (item.producer_id ?? item.id ?? index).toString()
          }
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>
                {searchQuery
                  ? "No se encontraron resultados"
                  : "No hay productores asignados"}
              </ThemedText>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: 64,
            offset: 64 * index,
            index,
          })}
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
  listHeader: {
    paddingBottom: verticalScale(8),
  },
  projectHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(12),
    marginBottom: verticalScale(20),
  },
  projectIconContainer: {
    width: widthScale(48),
    height: widthScale(48),
    borderRadius: widthScale(14),
    backgroundColor: "rgba(26, 122, 58, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  projectName: {
    fontSize: responsiveFont(20),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(8),
    marginBottom: verticalScale(12),
  },
  sectionTitle: {
    fontSize: responsiveFont(18),
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: widthScale(10),
    paddingHorizontal: widthScale(12),
    height: verticalScale(44),
    marginBottom: verticalScale(8),
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
  producerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(8),
    gap: widthScale(12),
    height: 64,
  },
  avatarCircle: {
    width: widthScale(40),
    height: widthScale(40),
    borderRadius: widthScale(20),
    backgroundColor: "rgba(26, 122, 58, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: responsiveFont(17),
  },
  rowId: {
    fontSize: responsiveFont(17),
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginLeft: widthScale(60),
  },
  emptyContainer: {
    paddingVertical: verticalScale(40),
    alignItems: "center",
  },
  emptyText: {
    fontSize: responsiveFont(17),
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: verticalScale(16),
    gap: widthScale(16),
  },
  pageButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: verticalScale(8),
    paddingHorizontal: widthScale(12),
    borderRadius: widthScale(8),
    backgroundColor: "rgba(26, 122, 58, 0.08)",
    gap: widthScale(4),
  },
  pageButtonDisabled: {
  },
  pageButtonText: {
    fontSize: responsiveFont(17),
    color: "#1a7a3a",
    fontWeight: "600",
  },
  pageButtonTextDisabled: {
    color: "#11181C",
  },
  pageIndicator: {
    fontSize: responsiveFont(17),
    fontWeight: "600",
  },
});
