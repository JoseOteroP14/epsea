import { ThemedText, type ThemedTextProps } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useThemeColor } from "@/hooks/use-theme-color";
import React from "react";
import { Text, type StyleProp, type TextStyle, useColorScheme } from "react-native";

/** "1.", "5.2.", "12." o "A." al inicio del texto */
const NUMBERED_OR_LETTER_PREFIX =
  /^(\d+(?:\.\d+)*\.|[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]\.)(\s*)([\s\S]*)$/;

/**
 * "CC: 123" / "Tipo de documento: CC" — etiqueta corta antes de los dos puntos.
 * Evita horas ("12:30") y textos sin valor después del ":".
 */
const LABEL_COLON_PREFIX = /^([^:\n]{1,48}:)(\s*)([\s\S]+)$/;

export type ReadableAccentParts = {
  prefix: string;
  rest: string;
};

export function splitReadableAccent(text: string): ReadableAccentParts | null {
  const trimmed = text.trimStart();
  if (!trimmed) return null;

  const numbered = trimmed.match(NUMBERED_OR_LETTER_PREFIX);
  if (numbered?.[3] != null && numbered[3].length > 0) {
    return {
      prefix: `${numbered[1]}${numbered[2] ?? ""}`,
      rest: numbered[3],
    };
  }

  const labeled = trimmed.match(LABEL_COLON_PREFIX);
  if (!labeled?.[3]) return null;

  const labelPart = (labeled[1] ?? "").trim();
  // Evitar "12:30" u otros prefijos solo numéricos
  if (/^\d+:$/.test(labelPart)) return null;

  return {
    prefix: `${labeled[1]}${labeled[2] ?? ""}`,
    rest: labeled[3],
  };
}

export type AccentedTextProps = Omit<ThemedTextProps, "children"> & {
  children: string;
  /** Color del prefijo acento (número / etiqueta). Por defecto tint del tema. */
  accentColor?: string;
  accentStyle?: StyleProp<TextStyle>;
};

/**
 * Resalta el prefijo estructural para facilitar el escaneo:
 * - "1. Fecha de nacimiento" → "1." en verde
 * - "CC: 123456" → "CC:" en verde
 */
export function AccentedText({
  children,
  style,
  accentColor,
  accentStyle,
  lightColor,
  darkColor,
  ...rest
}: AccentedTextProps) {
  const scheme = useColorScheme();
  const resolvedAccent =
    accentColor ??
    (scheme === "dark" ? Colors.dark.tint : Colors.light.tint);
  const parts = splitReadableAccent(children);

  if (!parts) {
    return (
      <ThemedText
        style={style}
        lightColor={lightColor}
        darkColor={darkColor}
        {...rest}
      >
        {children}
      </ThemedText>
    );
  }

  return (
    <ThemedText
      style={style}
      lightColor={lightColor}
      darkColor={darkColor}
      {...rest}
    >
      <Text style={[{ color: resolvedAccent, fontWeight: "700" }, accentStyle]}>
        {parts.prefix}
      </Text>
      {parts.rest}
    </ThemedText>
  );
}

export type AccentedLabelValueProps = Omit<ThemedTextProps, "children"> & {
  label: string;
  value: string;
  /** Incluye ":" en el label acento. Default true. */
  withColon?: boolean;
  accentColor?: string;
  accentStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
};

/** Label y valor separados: el label (antes de ":") va en verde. */
export function AccentedLabelValue({
  label,
  value,
  withColon = true,
  style,
  accentColor,
  accentStyle,
  valueStyle,
  lightColor,
  darkColor,
  ...rest
}: AccentedLabelValueProps) {
  const scheme = useColorScheme();
  const resolvedAccent =
    accentColor ??
    (scheme === "dark" ? Colors.dark.tint : Colors.light.tint);
  const valueColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    "text",
  );
  const prefix = withColon ? `${label}:` : label;

  return (
    <ThemedText
      style={style}
      lightColor={lightColor}
      darkColor={darkColor}
      {...rest}
    >
      <Text style={[{ color: resolvedAccent, fontWeight: "700" }, accentStyle]}>
        {prefix}
      </Text>
      <Text style={[{ color: valueColor }, valueStyle]}>{` ${value}`}</Text>
    </ThemedText>
  );
}
