import { CharacterizationTab } from "@/components/producer/characterization-tab";
import { ClassificationTab } from "@/components/producer/classification-tab";
import { PersonalInfoTab } from "@/components/producer/personal-info-tab";
import { ProducerInfoModal } from "@/components/producer/producer-info-modal";
import { ProductiveLinesTab } from "@/components/producer/productive-lines-tab";
import { PropertyInfoTab } from "@/components/producer/property-info-tab";
import { VisitTab } from "@/components/producer/visit-tab";
import { Visit2Tab } from "@/components/producer/visit2-tab";
import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import { useProducerStore } from "@/store/useProducerStore";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { useLocalSearchParams } from "expo-router";
import {
    AlertCircle,
    CalendarCheck,
    ClipboardCheck,
    ClipboardList,
    FileText,
    Home,
    Info,
    Sprout,
    User,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";

type SubTab =
  | "info_personal"
  | "caracterizacion"
  | "info_predio"
  | "actividad_productiva"
  | "clasificacion"
  | "visita"
  | "visita_2";

const SUB_TABS: { key: SubTab; label: string; icon: typeof ClipboardList }[] = [
  { key: "info_personal", label: "Info. Personal", icon: User },
  { key: "caracterizacion", label: "Caracterización", icon: ClipboardList },
  { key: "info_predio", label: "Info. Predio", icon: Home },
  { key: "actividad_productiva", label: "Act. Productiva", icon: Sprout },
  { key: "clasificacion", label: "Clasificación", icon: ClipboardCheck },
  { key: "visita", label: "Visita 1", icon: CalendarCheck },
  { key: "visita_2", label: "Visita 2", icon: CalendarCheck },
];

export default function ProducerDetailScreen() {
  const { producerId, projectId } = useLocalSearchParams<{
    producerId: string;
    projectId: string;
    projectName: string;
  }>();
  const { producerDetail, loadingDetail, error, fetchProducerDetail } =
    useProducerStore();

  const [activeSubTab, setActiveSubTab] = useState<SubTab>("info_personal");
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Scrollable sub-tabs
  const tabScrollRef = useRef<ScrollView>(null);
  const tabMeasurements = useRef<Record<string, { x: number; width: number }>>({});
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  useEffect(() => {
    fetchProducerDetail(producerId, projectId);
  }, [producerId, projectId, fetchProducerDetail]);

  const handleTabLayout = useCallback(
    (tab: SubTab, e: { nativeEvent: { layout: { x: number; width: number } } }) => {
      tabMeasurements.current[tab] = {
        x: e.nativeEvent.layout.x,
        width: e.nativeEvent.layout.width,
      };
      if (tab === activeSubTab) {
        indicatorX.value = e.nativeEvent.layout.x;
        indicatorWidth.value = e.nativeEvent.layout.width;
      }
    },
    [activeSubTab, indicatorX, indicatorWidth],
  );

  const handleSubTabPress = useCallback(
    (tab: SubTab) => {
      setActiveSubTab(tab);
      const m = tabMeasurements.current[tab];
      if (m) {
        indicatorX.value = withSpring(m.x, { damping: 20, stiffness: 200 });
        indicatorWidth.value = withSpring(m.width, { damping: 20, stiffness: 200 });
        tabScrollRef.current?.scrollTo({ x: m.x - widthScale(24), animated: true });
      }
    },
    [indicatorX, indicatorWidth],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  const getFullName = () => {
    if (!producerDetail) return "";
    return [
      producerDetail.first_name,
      producerDetail.middle_name,
      producerDetail.first_surname,
      producerDetail.last_surname,
    ]
      .filter(Boolean)
      .join(" ");
  };

  const getDocumentTypeName = () => producerDetail?.document_type?.name ?? null;

  const headerContent = producerDetail ? (
    <View style={styles.profileHeader}>
      <View style={styles.headerInfo}>
        <ThemedText
          type="subtitle"
          style={styles.fullName}
          numberOfLines={1}
        >
          {getFullName()}
        </ThemedText>
        <View style={styles.identificationBadge}>
          <FileText size={responsiveFont(11)} color="#ffffff" />
          <ThemedText style={styles.identification}>
            {getDocumentTypeName() || "CC"}: {producerDetail.identification}
          </ThemedText>
        </View>
      </View>
      <TouchableOpacity
        style={styles.infoButton}
        onPress={() => setShowInfoModal(true)}
        activeOpacity={0.7}
      >
        <Info size={responsiveFont(20)} color="#ffffff" />
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <StandardView
      headerBackgroundColor={{ light: "#1a7a3a", dark: "#0a1a10" }}
      headerContent={headerContent}
      noScroll
    >
      <View style={styles.container}>
        {!producerDetail && loadingDetail ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1a7a3a" />
          </View>
        ) : error && !producerDetail ? (
          <View style={styles.center}>
            <AlertCircle size={responsiveFont(48)} color="#e74c3c" />
            <ThemedText style={styles.errorText}>
              Error al cargar los datos del usuario
            </ThemedText>
          </View>
        ) : producerDetail ? (
          <View style={styles.mainContent}>
            {/* Sub-tabs bar — scrollable, edge-to-edge */}
            <View style={styles.subTabsBarWrapper}>
              <ScrollView
                ref={tabScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.subTabsBarContent}
              >
                {SUB_TABS.map((tab) => {
                  const isActive = activeSubTab === tab.key;
                  const Icon = tab.icon;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      style={styles.subTab}
                      onPress={() => handleSubTabPress(tab.key)}
                      onLayout={(e) => handleTabLayout(tab.key, e)}
                      activeOpacity={0.7}
                    >
                      <Icon
                        size={responsiveFont(16)}
                        color={isActive ? "#1a7a3a" : "#999"}
                      />
                      <ThemedText
                        numberOfLines={1}
                        style={[
                          styles.subTabText,
                          isActive && styles.subTabTextActive,
                        ]}
                      >
                        {tab.label}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
                <Animated.View style={[styles.subTabIndicator, indicatorStyle]} />
              </ScrollView>
            </View>

            {/* Sub-tab content — takes remaining space */}
            <View style={styles.subTabContent}>
              {activeSubTab === "info_personal" && (
                <PersonalInfoTab producerId={producerId} projectId={projectId} />
              )}
              {activeSubTab === "caracterizacion" && (
                <CharacterizationTab producerId={producerId} projectId={projectId} />
              )}
              {activeSubTab === "info_predio" && (
                <PropertyInfoTab producerId={producerId} projectId={projectId} />
              )}
              {activeSubTab === "actividad_productiva" && (
                <ProductiveLinesTab producerId={producerId} projectId={projectId} />
              )}
              {activeSubTab === "clasificacion" && (
                <ClassificationTab producerId={producerId} projectId={projectId} />
              )}
              {activeSubTab === "visita" && (
                <VisitTab producerId={producerId} projectId={projectId} />
              )}
              {activeSubTab === "visita_2" && (
                <Visit2Tab producerId={producerId} projectId={projectId} />
              )}
            </View>

            {/* Info modal */}
            <ProducerInfoModal
              visible={showInfoModal}
              onClose={() => setShowInfoModal(false)}
              producer={producerDetail}
            />
          </View>
        ) : null}

        {loadingDetail && producerDetail && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#1a7a3a" />
          </View>
        )}
      </View>
    </StandardView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: widthScale(12),
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: verticalScale(16),
  },
  mainContent: {
    flex: 1,
  },
  errorText: {
    fontSize: responsiveFont(17),
    textAlign: "center",
  },
  // Compact header
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: -widthScale(12),
    gap: widthScale(10),
  },
  headerInfo: {
    flex: 1,
  },
  fullName: {
    fontSize: responsiveFont(17),
    lineHeight: responsiveFont(21),
    color: "#ffffff",
  },
  identificationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(3),
    marginTop: verticalScale(2),
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: widthScale(6),
    paddingVertical: verticalScale(2),
    borderRadius: widthScale(5),
    alignSelf: "flex-start",
  },
  identification: {
    fontSize: responsiveFont(17),
    color: "#ffffff",
    fontWeight: "600",
  },
  infoButton: {
    width: widthScale(38),
    height: widthScale(38),
    borderRadius: widthScale(19),
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    justifyContent: "center",
    alignItems: "center",
  },
  // Sub-tabs
  subTabsBarWrapper: {
    marginHorizontal: -widthScale(12),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  subTabsBarContent: {
    paddingHorizontal: widthScale(12),
    position: "relative",
  },
  subTab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(14),
    gap: widthScale(5),
  },
  subTabText: {
    fontSize: responsiveFont(15),
    fontWeight: "500",
    color: "#11181C",
  },
  subTabTextActive: {
    color: "#1a7a3a",
    fontWeight: "700",
  },
  subTabIndicator: {
    position: "absolute",
    bottom: 0,
    height: 3,
    backgroundColor: "#1a7a3a",
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  subTabContent: {
    flex: 1,
  },
  loadingOverlay: {
    position: "absolute",
    top: verticalScale(60),
    right: widthScale(16),
  },
});
