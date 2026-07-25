import { ThemedText } from "@/components/themed-text";
import { VisitPhotoLightbox } from "@/components/ui/visit-photo-lightbox";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
  reportVisitImageLoadFailure,
  reportVisitImageLoadSuccess,
  type VisitImageKind,
} from "@/utils/visit-image-cache";
import { Image as ExpoImage, type ImageSource } from "expo-image";
import { ImagePlus, X } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

export interface VisitPhotoSlotModel {
  /** URI local o ImageSource remoto autenticado (agro-vue parity). */
  displaySource: string | ImageSource | null;
  label: string;
  hasPhoto: boolean;
  isDeleting?: boolean;
  isLoadingPreview?: boolean;
  remoteKind?: VisitImageKind;
  remoteImageId?: number | null;
}

type ShowAlertFn = (config: {
  title: string;
  message?: string;
  type?: "info" | "success" | "warning" | "error";
  cancelable?: boolean;
  buttons?: {
    text: string;
    style?: "default" | "cancel" | "destructive";
    onPress?: () => void;
  }[];
}) => void;

interface VisitPhotoSlotsProps {
  slots: VisitPhotoSlotModel[];
  onAdd: (index: number) => void;
  onRemove: (index: number) => void;
  /** Debe venir del padre (usa AlertProvider); el BottomSheet pierde el Context. */
  showAlert: ShowAlertFn;
}

function toSource(
  value: string | ImageSource | null,
): ImageSource | null {
  if (value == null) return null;
  if (typeof value === "string") return { uri: value };
  return value;
}

/**
 * Tres huecos de foto de visita: tap abre lightbox; X elimina; vacío agrega.
 */
export function VisitPhotoSlots({
  slots,
  onAdd,
  onRemove,
  showAlert,
}: VisitPhotoSlotsProps) {
  const [lightbox, setLightbox] = useState<{
    source: ImageSource;
    label: string;
  } | null>(null);
  const [brokenKeys, setBrokenKeys] = useState<Record<string, true>>({});

  const openLightbox = useCallback((source: ImageSource, label: string) => {
    setLightbox({ source, label });
  }, []);

  const confirmRemove = useCallback(
    (index: number, label: string) => {
      showAlert({
        title: "⚠ Eliminar fotografía",
        message: `¿Seguro que desea eliminar «${label}»?\n\nEsta acción no se puede deshacer desde aquí. Si la foto ya estaba en el servidor, el borrado se aplicará al sincronizar.`,
        type: "warning",
        cancelable: true,
        buttons: [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Eliminar",
            style: "destructive",
            onPress: () => onRemove(index),
          },
        ],
      });
    },
    [onRemove, showAlert],
  );

  return (
    <>
      <View style={styles.grid}>
        {slots.map((slot, index) => {
          if (!slot.hasPhoto) {
            return (
              <TouchableOpacity
                key={index}
                style={styles.slotEmpty}
                onPress={() => onAdd(index)}
                activeOpacity={0.7}
              >
                <ImagePlus size={responsiveFont(24)} color="rgba(0,0,0,0.2)" />
                <ThemedText style={styles.slotEmptyText}>
                  Imagen {index + 1}
                </ThemedText>
              </TouchableOpacity>
            );
          }

          const source = toSource(slot.displaySource);
          const brokenKey = `${slot.remoteKind ?? "local"}:${slot.remoteImageId ?? index}`;
          const isBroken = !!brokenKeys[brokenKey];
          const canShow = source != null && !isBroken;

          return (
            <View key={index} style={styles.slot}>
              <TouchableOpacity
                style={styles.imageHit}
                activeOpacity={0.9}
                onPress={() => {
                  if (canShow && source) {
                    openLightbox(source, slot.label);
                  }
                }}
                disabled={!canShow}
              >
                {canShow && source ? (
                  <ExpoImage
                    source={source}
                    style={styles.image}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={brokenKey}
                    onLoad={() => {
                      if (
                        slot.remoteKind != null &&
                        slot.remoteImageId != null
                      ) {
                        reportVisitImageLoadSuccess(
                          slot.remoteKind,
                          slot.remoteImageId,
                        );
                      }
                    }}
                    onError={() => {
                      if (
                        slot.remoteKind != null &&
                        slot.remoteImageId != null
                      ) {
                        reportVisitImageLoadFailure(
                          slot.remoteKind,
                          slot.remoteImageId,
                        );
                      }
                      setBrokenKeys((prev) => ({ ...prev, [brokenKey]: true }));
                    }}
                  />
                ) : (
                  <View style={[styles.image, styles.imagePlaceholder]}>
                    {slot.isLoadingPreview ? (
                      <ActivityIndicator size="small" color="#1a7a3a" />
                    ) : (
                      <ThemedText style={styles.placeholderText}>
                        Sin preview
                      </ThemedText>
                    )}
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => confirmRemove(index, slot.label)}
                disabled={slot.isDeleting}
                activeOpacity={0.7}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                {slot.isDeleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <X size={responsiveFont(14)} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      <VisitPhotoLightbox
        visible={lightbox != null}
        source={lightbox?.source ?? null}
        label={lightbox?.label}
        onClose={() => setLightbox(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: widthScale(10),
  },
  slot: {
    width: widthScale(100),
    height: widthScale(100),
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#e8f0eb",
    position: "relative",
  },
  imageHit: {
    flex: 1,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d7e5db",
  },
  placeholderText: {
    fontSize: responsiveFont(11),
    color: "rgba(0,0,0,0.35)",
  },
  removeBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  slotEmpty: {
    width: widthScale(100),
    height: widthScale(100),
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.12)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: verticalScale(4),
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  slotEmptyText: {
    fontSize: responsiveFont(11),
    color: "rgba(0,0,0,0.35)",
  },
});
