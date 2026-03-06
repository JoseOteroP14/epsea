import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import {
  BookOpen,
  Calendar,
  Globe,
  Heart,
  Mail,
  MapPin,
  Phone,
  User as UserIcon,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { ProducerDetail } from "@/schemas/producer";

interface ProducerInfoModalProps {
  visible: boolean;
  onClose: () => void;
  producer: ProducerDetail;
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoIconContainer}>{icon}</View>
      <View style={styles.infoContent}>
        <ThemedText style={styles.infoLabel}>{label}</ThemedText>
        <ThemedText style={styles.infoValue} numberOfLines={2}>
          {value}
        </ThemedText>
      </View>
    </View>
  );
}

function InfoRow({
  left,
  right,
}: {
  left: { icon: React.ReactNode; label: string; value?: string | null };
  right?: { icon: React.ReactNode; label: string; value?: string | null };
}) {
  const hasLeft = !!left.value;
  const hasRight = right && !!right.value;
  if (!hasLeft && !hasRight) return null;

  return (
    <View style={styles.infoRow}>
      {hasLeft && (
        <View style={styles.infoRowItem}>
          <InfoItem icon={left.icon} label={left.label} value={left.value} />
        </View>
      )}
      {hasRight && (
        <View style={styles.infoRowItem}>
          <InfoItem icon={right.icon} label={right.label} value={right.value} />
        </View>
      )}
      {hasLeft && !hasRight && <View style={styles.infoRowItem} />}
    </View>
  );
}

export function ProducerInfoModal({
  visible,
  onClose,
  producer,
}: ProducerInfoModalProps) {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["50%", "80%"], []);

  const iconColor = "#7f8c8d";
  const iconSize = responsiveFont(16);

  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose],
  );

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

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const fullName = [
    producer.first_name,
    producer.middle_name,
    producer.first_surname,
    producer.last_surname,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      enableDynamicSizing={false}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      {/* Header */}
      <View style={styles.sheetHeader}>
        <ThemedText
          type="defaultSemiBold"
          style={styles.sheetTitle}
          lightColor="#333"
          darkColor="#333"
        >
          {fullName}
        </ThemedText>
      </View>

      <BottomSheetScrollView
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Información Personal */}
        <ThemedView style={styles.section}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Información Personal
          </ThemedText>
          <InfoRow
            left={{
              icon: <UserIcon size={iconSize} color={iconColor} />,
              label: "Sexo",
              value: producer.sex?.name ?? null,
            }}
            right={{
              icon: <Calendar size={iconSize} color={iconColor} />,
              label: "Fecha de nacimiento",
              value: formatDate(producer.birthdate),
            }}
          />
          <InfoRow
            left={{
              icon: <Globe size={iconSize} color={iconColor} />,
              label: "Grupo étnico",
              value: producer.ethnic_group?.name ?? null,
            }}
            right={{
              icon: <BookOpen size={iconSize} color={iconColor} />,
              label: "Nivel educativo",
              value: producer.level_of_education?.name ?? null,
            }}
          />
          {producer.disability?.name && (
            <InfoRow
              left={{
                icon: <Heart size={iconSize} color={iconColor} />,
                label: "Discapacidad",
                value: producer.disability.name,
              }}
            />
          )}
        </ThemedView>

        {/* Contacto */}
        {(producer.phone || producer.email) && (
          <ThemedView style={styles.section}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Contacto
            </ThemedText>
            <InfoRow
              left={{
                icon: <Phone size={iconSize} color={iconColor} />,
                label: "Teléfono",
                value: producer.phone,
              }}
              right={{
                icon: <Mail size={iconSize} color={iconColor} />,
                label: "Email",
                value: producer.email,
              }}
            />
          </ThemedView>
        )}

        {/* Ubicación */}
        {(producer.municipality?.name ||
          producer.municipality?.department_name) && (
          <ThemedView style={styles.section}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Ubicación
            </ThemedText>
            <InfoRow
              left={{
                icon: <MapPin size={iconSize} color={iconColor} />,
                label: "Departamento",
                value: producer.municipality?.department_name ?? null,
              }}
              right={{
                icon: <MapPin size={iconSize} color={iconColor} />,
                label: "Municipio",
                value: producer.municipality?.name ?? null,
              }}
            />
          </ThemedView>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: "#f4fbf7",
    borderTopLeftRadius: widthScale(24),
    borderTopRightRadius: widthScale(24),
  },
  handleIndicator: {
    backgroundcolor: "#11181C",
    width: widthScale(40),
  },
  sheetHeader: {
    paddingHorizontal: widthScale(16),
    paddingTop: verticalScale(8),
    paddingBottom: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  sheetTitle: {
    fontSize: responsiveFont(17),
    textAlign: "center",
  },
  sheetContent: {
    paddingHorizontal: widthScale(16),
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(40),
  },
  section: {
    padding: widthScale(10),
    borderRadius: widthScale(12),
    marginBottom: verticalScale(8),
  },
  sectionTitle: {
    fontSize: responsiveFont(17),
    color: "#1a7a3a",
    marginBottom: verticalScale(8),
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: verticalScale(6),
  },
  infoRowItem: {
    flex: 1,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: widthScale(8),
  },
  infoIconContainer: {
    width: widthScale(28),
    height: widthScale(28),
    borderRadius: widthScale(6),
    backgroundColor: "rgba(0,0,0,0.03)",
    justifyContent: "center",
    alignItems: "center",
    marginTop: verticalScale(2),
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: responsiveFont(17),
    marginBottom: verticalScale(1),
  },
  infoValue: {
    fontSize: responsiveFont(17),
  },
});
