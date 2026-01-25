// constants/styles.ts
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 160,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    height: 300,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  // Agrega más estilos globales aquí
});

// También puedes exportar constantes de colores, tamaños, etc.
export const spacing = {
  small: 8,
  medium: 16,
  large: 24,
};

export const borderRadius = {
  small: 4,
  medium: 8,
  large: 16,
};
