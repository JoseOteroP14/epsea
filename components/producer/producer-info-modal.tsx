import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { ProducerDetail } from "@/schemas/producer";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    BottomSheetScrollView,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";

interface ProducerInfoModalProps {
  visible: boolean;
  onClose: () => void;
  producer: ProducerDetail;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoContent}>
        <ThemedText style={styles.infoLabel} numberOfLines={1} ellipsizeMode="tail">
          {label}:
        </ThemedText>
        <ThemedText style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
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
  left: { label: string; value?: string | null };
  right?: { label: string; value?: string | null };
}) {
  const hasLeft = !!left.value;
  const hasRight = right && !!right.value;
  if (!hasLeft && !hasRight) return null;

  return (
    <View style={styles.infoRow}>
      {hasLeft && <InfoItem label={left.label} value={left.value} />}
      {hasRight && <InfoItem label={right.label} value={right.value} />}
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

  const producerSource = producer as Record<string, unknown>;

  const documentTypeName =
    toText(producerSource.document_type_name) ?? toText(producer.document_type?.name);
  const identification = toText(producerSource.identification) ?? toText(producer.identification);

  const firstName = toText(producerSource.first_name) ?? toText(producer.first_name);
  const middleName = toText(producerSource.middle_name) ?? toText(producer.middle_name);
  const firstSurname =
    toText(producerSource.first_surname) ?? toText(producer.first_surname);
  const lastSurname = toText(producerSource.last_surname) ?? toText(producer.last_surname);

  const projectName = toText(producerSource.project_name);

  const municipality =
    toText(producerSource.municipality) ?? toText(producer.municipality?.name);
  const municipalityCode =
    toText(producerSource.municipality_code) ?? toText(producer.municipality?.code);
  const department =
    toText(producerSource.department) ?? toText(producer.municipality?.department_name);
  const departmentCode =
    toText(producerSource.department_cod) ??
    toText(producer.municipality?.department_code);

  const productionLineName = toText(producerSource.production_line_name);

  const fullName = [
    producer.first_name,
    producer.middle_name,
    producer.first_surname,
    producer.last_surname,
  ]
    .filter(Boolean)
    .join(" ");

  const producerTitle = fullName || "Información del usuario";

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
          {producerTitle}
        </ThemedText>
      </View>

      <BottomSheetScrollView
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Datos solicitados del usuario asignado */}
        <ThemedView style={styles.section}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Datos del Usuario
          </ThemedText>
          <InfoRow
            left={{
              label: "Tipo de documento",
              value: documentTypeName,
            }}
            right={{
              label: "Identificación",
              value: identification,
            }}
          />
          <InfoRow
            left={{
              label: "Primer nombre",
              value: firstName,
            }}
            right={{
              label: "Segundo nombre",
              value: middleName,
            }}
          />
          <InfoRow
            left={{
              label: "Primer apellido",
              value: firstSurname,
            }}
            right={{
              label: "Segundo apellido",
              value: lastSurname,
            }}
          />
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Proyecto y Ubicación
          </ThemedText>
          <InfoRow
            left={{
              label: "Proyecto",
              value: projectName,
            }}
          />
          <InfoRow
            left={{
              label: "Departamento",
              value: department,
            }}
            right={{
              label: "Municipio",
              value: municipality,
            }}
          />
          <InfoRow
            left={{
              label: "Código departamento",
              value: departmentCode,
            }}
            right={{
              label: "Código municipio",
              value: municipalityCode,
            }}
          />
          <InfoRow
            left={{
              label: "Línea productiva principal",
              value: productionLineName,
            }}
          />
        </ThemedView>
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
    backgroundColor: "#11181C",
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
    gap: verticalScale(8),
    marginBottom: verticalScale(8),
  },
  infoItem: {
    paddingVertical: verticalScale(2),
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: responsiveFont(17),
    marginBottom: verticalScale(1),
    fontWeight: "700",
    color: "#1a7a3a",
  },
  infoValue: {
    fontSize: responsiveFont(17),
    fontWeight: "600",
  },
});
