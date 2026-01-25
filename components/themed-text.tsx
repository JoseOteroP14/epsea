import { Fonts } from '@/constants/theme';
import { responsiveFont } from '@/utils/responsive';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';



export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: responsiveFont(17),
    lineHeight: responsiveFont(26),
    fontFamily: Fonts.rounded,
    letterSpacing: -responsiveFont(0.4),
    fontWeight: '500',
  },
  defaultSemiBold: {
    fontSize: responsiveFont(17),
    lineHeight: responsiveFont(26),
    fontWeight: '700',
    fontFamily: Fonts.rounded,
    letterSpacing: -responsiveFont(0.4),
  },
  title: {
    fontSize: responsiveFont(34),
    fontWeight: '900',
    lineHeight: responsiveFont(38),
    fontFamily: Fonts.rounded,
    letterSpacing: -responsiveFont(1.0),
  },
  subtitle: {
    fontSize: responsiveFont(24),
    fontWeight: '800',
    fontFamily: Fonts.rounded,
    letterSpacing: -responsiveFont(0.6),
  },
  link: {
    lineHeight: responsiveFont(30),
    fontSize: responsiveFont(17),
    color: '#0a7ea4',
    fontFamily: Fonts.rounded,
    letterSpacing: -responsiveFont(0.4),
  },
});
