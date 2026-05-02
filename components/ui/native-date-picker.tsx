import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";

// value and onChange always use "dd/mm/yyyy" format
// For "yyyy-mm-dd" callers, convert before/after

interface NativeDatePickerProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

let DateTimePicker: React.ComponentType<any> | null = null;
try {
  const module = require("@react-native-community/datetimepicker");
  DateTimePicker = module?.default ?? module;
} catch {
  DateTimePicker = null;
}

function parseFromDisplay(ddmmyyyy: string): Date {
  const parts = ddmmyyyy.split("/");
  if (parts.length !== 3) return new Date();
  const d = parseInt(parts[0] ?? "1", 10);
  const m = parseInt(parts[1] ?? "1", 10) - 1;
  const y = parseInt(parts[2] ?? "2000", 10);
  const date = new Date(y, m, d);
  return isNaN(date.getTime()) ? new Date() : date;
}

function formatToDisplay(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function NativeDatePicker({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
}: NativeDatePickerProps) {
  const Picker = DateTimePicker;

  if (!Picker) {
    return (
      <View style={styles.selector}>
        <TextInput
          style={styles.text}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="rgba(17, 24, 28, 0.4)"
        />
        <Calendar size={responsiveFont(16)} color="#1a7a3a" />
      </View>
    );
  }

  const [show, setShow] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const currentDate = value ? parseFromDisplay(value) : new Date();

  const handleChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") {
      setShow(false);
      if (selected) onChange(formatToDisplay(selected));
    } else {
      if (selected) setTempDate(selected);
    }
  };

  const handleOpen = () => {
    setTempDate(currentDate);
    setShow(true);
  };

  const handleConfirmIOS = () => {
    onChange(formatToDisplay(tempDate));
    setShow(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.selector}
        onPress={handleOpen}
        activeOpacity={0.8}
      >
        <Text style={value ? styles.text : styles.placeholder}>
          {value || placeholder}
        </Text>
        <Calendar size={responsiveFont(16)} color="#1a7a3a" />
      </TouchableOpacity>

      {Platform.OS === "android" && show && (
        <Picker
          value={currentDate}
          mode="date"
          display="default"
          onChange={handleChange}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal visible={show} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleConfirmIOS}>
                  <Text style={styles.doneText}>Listo</Text>
                </TouchableOpacity>
              </View>
              <Picker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleChange}
                locale="es-CO"
                style={styles.iosPicker}
              />
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  selector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: widthScale(8),
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(12),
    backgroundColor: "#fff",
  },
  text: {
    flex: 1,
    fontSize: responsiveFont(15),
    color: "#333",
  },
  placeholder: {
    flex: 1,
    fontSize: responsiveFont(15),
    color: "rgba(17, 24, 28, 0.4)",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: widthScale(16),
    borderTopRightRadius: widthScale(16),
    paddingBottom: verticalScale(24),
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: widthScale(20),
    paddingVertical: verticalScale(14),
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  cancelText: {
    fontSize: responsiveFont(16),
    color: "#666",
  },
  doneText: {
    fontSize: responsiveFont(16),
    color: "#1a7a3a",
    fontWeight: "600",
  },
  iosPicker: {
    height: verticalScale(200),
  },
});
