import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import type { Producer } from "@/schemas/producer";
import { useAuthStore } from "@/store/useAuthStore";
import { useProducerStore } from "@/store/useProducerStore";
import { apiFetch } from "@/utils/api";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    BottomSheetScrollView,
    useBottomSheetTimingConfigs,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    ChevronLeft,
    ChevronRight,
    Folder,
    Info,
    Search,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Easing } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

interface ExtensionistProjectReport {
  total_assigned: number;
  total_surveyed_classification: number;
  total_surveyed_visit_1: number;
  total_surveyed_general_information: number;
  total_surveyed_characterization: number;
  total_surveyed_property_information: number;
}

function toPercent(value: number, total: number): number {
  if (!total || total <= 0) return 0;
  const percent = (value / total) * 100;
  return Math.min(100, Math.round(percent * 10) / 10);
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? `${value.toFixed(0)}%` : `${value.toFixed(1)}%`;
}

const PROJECT_STATS_SHEET_COLORS = {
  progressFill: "#0f7a2f",
  progressTrack: "#d8e3dc",
};

export default function ProjectDetailScreen() {
  const { id, name } = useLocalSearchParams<{
    id: string;
    name: string;
  }>();
  const router = useRouter();
  const extensionistId = useAuthStore((state) => state.user?.user_id);
  const [showStatsSheet, setShowStatsSheet] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [projectReport, setProjectReport] =
    useState<ExtensionistProjectReport | null>(null);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["82%"], []);
  const sheetAnimationConfigs = useBottomSheetTimingConfigs({
    duration: 320,
    easing: Easing.out(Easing.cubic),
  });

  const {
    producers,
    loading,
    searchQuery,
    fetchProducers,
    setSearchQuery,
    resetState,
  } = useProducerStore();

  const [currentPage, setCurrentPage] = useState(1);
  const clientPageSize = 20;
  const fetchLimit = 150;

  useEffect(() => {
    fetchProducers(id, 1, fetchLimit);
    setCurrentPage(1);
    return () => resetState();
  }, [fetchProducers, fetchLimit, id, resetState]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (showStatsSheet) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [showStatsSheet]);

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      setShowStatsSheet(false);
    }
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

  const fetchProjectReport = useCallback(async () => {
    if (!id || !extensionistId) {
      setProjectReport(null);
      setReportError("No fue posible identificar el proyecto o extensionista.");
      return;
    }

    setReportLoading(true);
    setReportError(null);
    try {
      const response = await apiFetch<any>(
        `/reports-extensionist/project/${id}/extensionist/${extensionistId}`,
        { method: "GET" },
      );

      const data = response?.data ?? response;
      setProjectReport({
        total_assigned: Number(data?.total_assigned ?? 0),
        total_surveyed_classification: Number(data?.total_surveyed_classification ?? 0),
        total_surveyed_visit_1: Number(data?.total_surveyed_visit_1 ?? 0),
        total_surveyed_general_information: Number(
          data?.total_surveyed_general_information ?? 0,
        ),
        total_surveyed_characterization: Number(data?.total_surveyed_characterization ?? 0),
        total_surveyed_property_information: Number(
          data?.total_surveyed_property_information ?? 0,
        ),
      });
    } catch (error) {
      setProjectReport(null);
      setReportError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las estadísticas del proyecto.",
      );
    } finally {
      setReportLoading(false);
    }
  }, [id, extensionistId]);

  const openProjectInfo = useCallback(() => {
    setShowStatsSheet(true);
    fetchProjectReport();
  }, [fetchProjectReport]);

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

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredProducers.length / clientPageSize));
  }, [filteredProducers.length]);

  const pagedProducers = useMemo(() => {
    const start = (currentPage - 1) * clientPageSize;
    return filteredProducers.slice(start, start + clientPageSize);
  }, [filteredProducers, currentPage, clientPageSize]);

  const reportRows = useMemo(() => {
    const totalAssigned = projectReport?.total_assigned ?? 0;
    const rows = [
      {
        key: "general",
        label: "Información general",
        value: projectReport?.total_surveyed_general_information ?? 0,
      },
      {
        key: "characterization",
        label: "Caracterización",
        value: projectReport?.total_surveyed_characterization ?? 0,
      },
      {
        key: "property",
        label: "Información del predio",
        value: projectReport?.total_surveyed_property_information ?? 0,
      },
      {
        key: "classification",
        label: "Clasificación",
        value: projectReport?.total_surveyed_classification ?? 0,
      },
      {
        key: "visit1",
        label: "Visita 1",
        value: projectReport?.total_surveyed_visit_1 ?? 0,
      },
    ];

    return rows.map((row) => ({
      ...row,
      percent: toPercent(row.value, totalAssigned),
      totalAssigned,
    }));
  }, [projectReport]);

  const totalInterventionProgress = useMemo(() => {
    if (reportRows.length === 0) return 0;
    const sum = reportRows.reduce((acc, row) => acc + row.percent, 0);
    return Math.min(100, Math.max(0, sum / reportRows.length));
  }, [reportRows]);

  const radialSize = widthScale(176);
  const radialStrokeWidth = widthScale(18);
  const radialRadius = (radialSize - radialStrokeWidth) / 2;
  const radialCircumference = 2 * Math.PI * radialRadius;
  const radialDashOffset =
    radialCircumference - (totalInterventionProgress / 100) * radialCircumference;

  const goToPage = useCallback(
    (page: number) => {
      const nextPage = Math.min(Math.max(1, page), totalPages);
      setCurrentPage(nextPage);
    },
    [totalPages],
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
    [searchQuery],
  );

  const HeaderContent = useMemo(
    () => (
      <View style={styles.projectHeader}>
        <View style={styles.projectIconContainer}>
          <Folder size={responsiveFont(22)} color="#ffffff" />
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
        <TouchableOpacity
          style={styles.infoButton}
          onPress={openProjectInfo}
          activeOpacity={0.7}
        >
          <Info size={responsiveFont(18)} color="#ffffff" />
        </TouchableOpacity>
      </View>
    ),
    [name, openProjectInfo],
  );

  const ListFooter = useMemo(() => {
    if (totalPages <= 1) return null;
    return (
      <View style={styles.paginationContainer}>
        <TouchableOpacity
          style={[
            styles.pageButton,
            currentPage <= 1 && styles.pageButtonDisabled,
          ]}
          onPress={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft
            size={responsiveFont(16)}
            color={currentPage <= 1 ? "#bdc3c7" : "#1a7a3a"}
          />
          <ThemedText
            style={[
              styles.pageButtonText,
              currentPage <= 1 && styles.pageButtonTextDisabled,
            ]}
          >
            Anterior
          </ThemedText>
        </TouchableOpacity>

        <ThemedText style={styles.pageIndicator}>
          {currentPage} / {totalPages}
        </ThemedText>

        <TouchableOpacity
          style={[
            styles.pageButton,
            currentPage >= totalPages && styles.pageButtonDisabled,
          ]}
          onPress={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          <ThemedText
            style={[
              styles.pageButtonText,
              currentPage >= totalPages && styles.pageButtonTextDisabled,
            ]}
          >
            Siguiente
          </ThemedText>
          <ChevronRight
            size={responsiveFont(16)}
            color={
              currentPage >= totalPages
                ? "#bdc3c7"
                : "#1a7a3a"
            }
          />
        </TouchableOpacity>
      </View>
    );
  }, [currentPage, totalPages, goToPage]);

  return (
    <>
      <StandardView
        headerBackgroundColor={{ light: "#1a7a3a", dark: "#0a1a10" }}
        headerContent={HeaderContent}
        noScroll
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1a7a3a" />
          </View>
        ) : (
          <FlatList
            data={pagedProducers}
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
                    : "No hay usuarios asignados"}
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

      <BottomSheetModal
        ref={bottomSheetModalRef}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        animateOnMount
        animationConfigs={sheetAnimationConfigs}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        enableDynamicSizing={false}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          {reportLoading ? (
            <View style={styles.sheetCenter}>
              <ActivityIndicator size="small" color="#1a7a3a" />
              <ThemedText style={styles.loadingStatsText}>
                Cargando estadísticas...
              </ThemedText>
            </View>
          ) : reportError ? (
            <View style={styles.sheetCenter}>
              <ThemedText style={styles.errorStatsText}>{reportError}</ThemedText>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={fetchProjectReport}
                activeOpacity={0.8}
              >
                <ThemedText lightColor="#fff" darkColor="#fff" style={styles.retryButtonText}>
                  Reintentar
                </ThemedText>
              </TouchableOpacity>
            </View>
          ) : projectReport ? (
            <>
              <View style={styles.radialSection}>
                <View style={styles.radialWrapper}>
                  <Svg width={radialSize} height={radialSize}>
                    <Circle
                      cx={radialSize / 2}
                      cy={radialSize / 2}
                      r={radialRadius}
                      stroke="rgba(26, 122, 58, 0.10)"
                      strokeWidth={radialStrokeWidth}
                      fill="none"
                    />
                    <Circle
                      cx={radialSize / 2}
                      cy={radialSize / 2}
                      r={radialRadius}
                      stroke="#0f7a2f"
                      strokeWidth={radialStrokeWidth}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${radialCircumference} ${radialCircumference}`}
                      strokeDashoffset={radialDashOffset}
                      transform={`rotate(-90 ${radialSize / 2} ${radialSize / 2})`}
                    />
                  </Svg>
                  <View style={styles.radialCenterContent}>
                    <ThemedText style={styles.radialPercentText}>
                      {totalInterventionProgress.toFixed(2)}%
                    </ThemedText>
                    <ThemedText style={styles.radialLabelText}>Avance total</ThemedText>
                  </View>
                </View>
              </View>

              <View style={styles.statsSheetList}>
                {reportRows.map((row) => (
                  <View key={row.key} style={styles.surveyRow}>
                    <View style={styles.surveyRowHeader}>
                      <ThemedText style={styles.surveyLabel}>{row.label}</ThemedText>
                      <ThemedText style={styles.surveyValue}>
                        {row.value}/{row.totalAssigned} ({formatPercent(row.percent)})
                      </ThemedText>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${row.percent}%`,
                            backgroundColor: PROJECT_STATS_SHEET_COLORS.progressFill,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
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
  },
  projectIconContainer: {
    width: widthScale(48),
    height: widthScale(48),
    borderRadius: widthScale(14),
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  projectName: {
    fontSize: responsiveFont(20),
    color: "#ffffff",
  },
  infoButton: {
    width: widthScale(34),
    height: widthScale(34),
    borderRadius: widthScale(17),
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    justifyContent: "center",
    alignItems: "center",
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
    gap: widthScale(8),
    height: 64,
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
    marginLeft: widthScale(8),
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
  sheetBackground: {
    backgroundColor: "#f4fbf7",
    borderTopLeftRadius: widthScale(24),
    borderTopRightRadius: widthScale(24),
  },
  handleIndicator: {
    backgroundColor: "#11181C",
    width: widthScale(40),
  },
  sheetContent: {
    paddingHorizontal: widthScale(16),
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(40),
    gap: verticalScale(12),
  },
  radialSection: {
    alignItems: "center",
    paddingTop: verticalScale(4),
    paddingBottom: verticalScale(8),
  },
  radialWrapper: {
    width: widthScale(176),
    height: widthScale(176),
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  radialCenterContent: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  radialPercentText: {
    fontSize: responsiveFont(28),
    color: "#ff5b00",
    fontWeight: "800",
  },
  radialLabelText: {
    marginTop: verticalScale(2),
    fontSize: responsiveFont(16),
    color: "#0f7a2f",
    fontWeight: "600",
  },
  sheetCenter: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: verticalScale(24),
    gap: verticalScale(10),
  },
  loadingStatsText: {
    fontSize: responsiveFont(15),
  },
  errorStatsText: {
    fontSize: responsiveFont(15),
    color: "#c0392b",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#1a7a3a",
    paddingVertical: verticalScale(8),
    paddingHorizontal: widthScale(16),
    borderRadius: widthScale(8),
  },
  retryButtonText: {
    fontSize: responsiveFont(14),
    fontWeight: "600",
  },
  statsSheetList: {
    gap: verticalScale(10),
  },
  surveyRow: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: widthScale(10),
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(12),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  surveyRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: widthScale(8),
    marginBottom: verticalScale(8),
  },
  surveyLabel: {
    flex: 1,
    fontSize: responsiveFont(15),
    fontWeight: "600",
  },
  surveyValue: {
    fontSize: responsiveFont(14),
    color: "#11181C",
    fontWeight: "600",
  },
  progressTrack: {
    width: "100%",
    height: verticalScale(8),
    borderRadius: widthScale(4),
    backgroundColor: PROJECT_STATS_SHEET_COLORS.progressTrack,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: widthScale(4),
  },
});
